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
import { AuthResponse, MagicLinkResponse } from './dto/auth.response';
import { ClaimTokensService } from '../claim-tokens/claim-tokens.service';
import { ClaimTokenPurpose } from '../common/enums/claim-token-purpose.enum';
import { EmailService } from '../email/email.service';
import { Role } from '../common/enums/role.enum';

const MAGIC_LINK_TTL_MS = 15 * 60_000;

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

  async claim(dto: ClaimDto): Promise<AuthResponse> {
    const claim = await this.claimTokens.consume(
      dto.token,
      ClaimTokenPurpose.CLAIM,
    );
    const user = await this.users.findById(claim.userId);
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
    });

    return this.buildAuthResponse(updated);
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  }): Promise<AuthResponse> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.config.get('APP_JWT_EXPIRES_IN', '15m'),
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh' },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('APP_JWT_REFRESH_EXPIRES_IN', '14d'),
      },
    );
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      accessToken,
      refreshToken,
    };
  }
}
