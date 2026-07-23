import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MagicLinkDto } from './dto/magic-link.dto';
import { ClaimDto, ConsumeMagicLinkDto } from './dto/claim.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthResponse, MagicLinkResponse } from './dto/auth.response';
import { ClaimTokensService } from '../claim-tokens/claim-tokens.service';
import { ClaimTokenPurpose } from '../common/enums/claim-token-purpose.enum';
import { EmailService } from '../email/email.service';
import { Role } from '../common/enums/role.enum';

const MAGIC_LINK_TTL_MS = 15 * 60_000;
const PASSWORD_RESET_TTL_MS = 30 * 60_000;
const GHOST_CLAIM_TTL_MS = 24 * 60 * 60_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly claimTokens: ClaimTokensService,
    private readonly emails: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      if (existing.passwordHash) {
        throw new BadRequestException('email already registered');
      }
      // Existing ghost account: convert via claim flow.
      throw new BadRequestException(
        'email already registered — use the claim link sent to your inbox',
      );
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      cpf: dto.cpf,
      phone: dto.phone,
      passwordHash,
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('invalid credentials');

    return this.buildAuthResponse(user);
  }

  async requestMagicLink(dto: MagicLinkDto): Promise<MagicLinkResponse> {
    // Always answer `sent: true` to avoid leaking which emails are registered.
    const user = await this.users.findByEmail(dto.email);
    if (!user) return { sent: true };

    const claim = await this.claimTokens.issue(
      user.id,
      ClaimTokenPurpose.MAGIC_LINK,
      MAGIC_LINK_TTL_MS,
    );
    const url = `${this.emails.baseUrl}/auth/magic?token=${encodeURIComponent(claim.token)}`;
    try {
      await this.emails.sendMagicLink({ to: user.email, url });
    } catch (err) {
      this.logger.warn(
        `magic-link send failed for ${user.email}: ${(err as Error).message}`,
      );
    }
    return { sent: true };
  }

  async consumeMagicLink(dto: ConsumeMagicLinkDto): Promise<AuthResponse> {
    const claim = await this.claimTokens.consume(
      dto.token,
      ClaimTokenPurpose.MAGIC_LINK,
    );
    const user = await this.users.findById(claim.userId);
    if (!user) throw new BadRequestException('user not found');
    return this.buildAuthResponse(user);
  }

  /**
   * Sempre responde `sent: true` para não revelar quais e-mails têm conta.
   * Conta "ghost" (sem senha, criada por venda-por-e-mail) não tem senha a
   * redefinir: mandamos o link de ativação, que é o caminho real dela — e que
   * também coleta nome/CPF/telefone.
   */
  async requestPasswordReset(
    dto: ForgotPasswordDto,
  ): Promise<MagicLinkResponse> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) return { sent: true };

    const isGhost = !user.passwordHash;
    const claim = await this.claimTokens.issueExclusive(
      user.id,
      isGhost ? ClaimTokenPurpose.CLAIM : ClaimTokenPurpose.PASSWORD_RESET,
      isGhost ? GHOST_CLAIM_TTL_MS : PASSWORD_RESET_TTL_MS,
    );
    const token = encodeURIComponent(claim.token);
    const url = isGhost
      ? `${this.emails.baseUrl}/claim?token=${token}`
      : `${this.emails.baseUrl}/auth/redefinir-senha?token=${token}`;

    try {
      if (isGhost) {
        await this.emails.sendMagicLink({ to: user.email, url });
      } else {
        await this.emails.sendPasswordReset({ to: user.email, url });
      }
    } catch (err) {
      this.logger.warn(
        `password-reset send failed for ${user.email}: ${(err as Error).message}`,
      );
    }
    return { sent: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<AuthResponse> {
    const claim = await this.claimTokens.consume(
      dto.token,
      ClaimTokenPurpose.PASSWORD_RESET,
    );
    const user = await this.users.findById(claim.userId);
    if (!user) throw new BadRequestException('user not found');

    const passwordHash = await argon2.hash(dto.password);
    const updated = await this.users.update(user.id, {
      passwordHash,
      // Trocar a senha derruba as sessões antigas — inclusive a de quem tenha
      // comprometido a conta. A sessão devolvida abaixo já usa a versão nova.
      tokenVersion: (user.tokenVersion ?? 0) + 1,
    });

    return this.buildAuthResponse(updated);
  }

  async claim(dto: ClaimDto): Promise<AuthResponse> {
    const claim = await this.claimTokens.consume(
      dto.token,
      ClaimTokenPurpose.CLAIM,
    );
    const user = await this.users.findByIdWithSecrets(claim.userId);
    if (!user) throw new BadRequestException('user not found');
    if (user.passwordHash) {
      throw new BadRequestException('account already claimed — use login');
    }

    if (user.cpf && user.cpf !== dto.cpf) {
      // CPF previously seeded: reject divergent input to prevent silent overwrite.
      throw new BadRequestException('cpf does not match account on file');
    }

    const passwordHash = await argon2.hash(dto.password);
    const updated = await this.users.update(user.id, {
      name: dto.name,
      cpf: dto.cpf,
      phone: dto.phone,
      passwordHash,
      claimedAt: new Date(),
      role: user.role === Role.BUYER ? Role.BUYER : user.role,
      // Ativar a conta invalida qualquer refresh token emitido antes.
      tokenVersion: (user.tokenVersion ?? 0) + 1,
    });

    return this.buildAuthResponse(updated);
  }

  /**
   * Troca de senha pelo perfil. Quem já tem senha precisa confirmar a atual;
   * quem nunca definiu uma (entrou só por link mágico) pode definir direto —
   * caso contrário não teria como criar senha sem passar pelo "esqueci".
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<AuthResponse> {
    const user = await this.users.findByIdWithSecrets(userId);
    if (!user) throw new UnauthorizedException('user not found');

    if (user.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException('currentPassword is required');
      }
      const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
      if (!ok) throw new UnauthorizedException('invalid credentials');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    const updated = await this.users.update(user.id, {
      passwordHash,
      tokenVersion: (user.tokenVersion ?? 0) + 1,
    });

    return this.buildAuthResponse(updated);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: { sub: string; type: string; tv?: number };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('invalid token type');
    }
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('user not found');
    }
    // Revogação: se a versão do token não bate com a do usuário (troca de
    // senha / claim), o refresh foi invalidado.
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('refresh token revoked');
    }
    return this.buildAuthResponse(user);
  }

  /**
   * Logout / revoke-all: bumps the user's tokenVersion so every previously
   * issued refresh token stops validating (see `refresh()`). Access tokens are
   * short-lived (15m) and expire on their own.
   */
  async logout(userId: string): Promise<{ success: true }> {
    const user = await this.users.findById(userId);
    if (user) {
      await this.users.update(userId, {
        tokenVersion: (user.tokenVersion ?? 0) + 1,
      });
    }
    return { success: true };
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    tokenVersion?: number;
  }): Promise<AuthResponse> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.config.get('APP_JWT_EXPIRES_IN', '15m'),
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh', tv: user.tokenVersion ?? 0 },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('APP_JWT_REFRESH_EXPIRES_IN', '14d'),
      },
    );
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }
}
