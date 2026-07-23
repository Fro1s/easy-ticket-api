import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
// Stub the services whose transitive dep (@paralleldrive/cuid2, ESM-only) Jest
// cannot load. We only need their shape here — both are injected as mocks.
jest.mock('../users/users.service', () => ({ UsersService: class {} }));
jest.mock('../claim-tokens/claim-tokens.service', () => ({
  ClaimTokensService: class {},
}));
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { ClaimTokensService } from '../claim-tokens/claim-tokens.service';
import { EmailService } from '../email/email.service';
import { ClaimTokenPurpose } from '../common/enums/claim-token-purpose.enum';
import { User } from '../users/entities/user.entity';

/** Patch passado ao `users.update` na chamada `call` (0-indexed). */
function patchFrom(update: jest.Mock, call = 0): Partial<User> {
  const args = update.mock.calls[call] as [string, Partial<User>];
  return args[1];
}

/**
 * O fluxo de redefinição carrega três garantias de segurança que valem
 * regressão: não vazar quais e-mails existem, derrubar sessões antigas ao
 * trocar a senha, e exigir a senha atual de quem já tem uma.
 */
describe('AuthService password reset', () => {
  const config = {
    getOrThrow: () => 'test-secret',
    get: (_key: string, fallback?: string) => fallback,
  } as unknown as ConfigService;

  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
  } as unknown as JwtService;

  function makeService(overrides: {
    users?: Partial<UsersService>;
    claimTokens?: Partial<ClaimTokensService>;
    emails?: Partial<EmailService>;
  }) {
    const claimTokens = {
      issueExclusive: jest.fn().mockResolvedValue({ token: 'raw-token' }),
      consume: jest.fn(),
      ...overrides.claimTokens,
    };
    const emails = {
      baseUrl: 'https://app.test',
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendMagicLink: jest.fn().mockResolvedValue(undefined),
      ...overrides.emails,
    };
    const users = { ...overrides.users };
    const service = new AuthService(
      users as UsersService,
      jwt,
      config,
      claimTokens as unknown as ClaimTokensService,
      emails as unknown as EmailService,
    );
    return { service, claimTokens, emails, users };
  }

  describe('requestPasswordReset', () => {
    it('reports sent for an unknown email without issuing a token', async () => {
      const { service, claimTokens, emails } = makeService({
        users: { findByEmail: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.requestPasswordReset({ email: 'ghost@nowhere.com' }),
      ).resolves.toEqual({ sent: true });

      expect(claimTokens.issueExclusive).not.toHaveBeenCalled();
      expect(emails.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('sends a PASSWORD_RESET link to an account that has a password', async () => {
      const { service, claimTokens, emails } = makeService({
        users: {
          findByEmail: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'a@b.com',
            passwordHash: 'h',
          }),
        },
      });

      await service.requestPasswordReset({ email: 'a@b.com' });

      expect(claimTokens.issueExclusive).toHaveBeenCalledWith(
        'u1',
        ClaimTokenPurpose.PASSWORD_RESET,
        30 * 60_000,
      );
      expect(emails.sendPasswordReset).toHaveBeenCalledWith({
        to: 'a@b.com',
        url: 'https://app.test/auth/redefinir-senha?token=raw-token',
      });
      expect(emails.sendMagicLink).not.toHaveBeenCalled();
    });

    it('sends the activation link instead when the account is a ghost', async () => {
      // Ghost = sem passwordHash: não há senha a redefinir, o caminho real é o
      // claim (que também coleta nome/CPF/telefone).
      const { service, claimTokens, emails } = makeService({
        users: {
          findByEmail: jest.fn().mockResolvedValue({
            id: 'u2',
            email: 'ghost@b.com',
            passwordHash: null,
          }),
        },
      });

      await service.requestPasswordReset({ email: 'ghost@b.com' });

      expect(claimTokens.issueExclusive).toHaveBeenCalledWith(
        'u2',
        ClaimTokenPurpose.CLAIM,
        24 * 60 * 60_000,
      );
      expect(emails.sendMagicLink).toHaveBeenCalledWith({
        to: 'ghost@b.com',
        url: 'https://app.test/claim?token=raw-token',
      });
      expect(emails.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('still reports sent when the email provider throws', async () => {
      // Falha de envio não pode virar sinal de que a conta existe.
      const { service } = makeService({
        users: {
          findByEmail: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'a@b.com',
            passwordHash: 'h',
          }),
        },
        emails: {
          sendPasswordReset: jest
            .fn()
            .mockRejectedValue(new Error('smtp down')),
        },
      });

      await expect(
        service.requestPasswordReset({ email: 'a@b.com' }),
      ).resolves.toEqual({ sent: true });
    });
  });

  describe('resetPassword', () => {
    it('stores a hash of the new password and revokes existing sessions', async () => {
      const update = jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'A',
        role: 'BUYER',
        tokenVersion: 4,
      });
      const { service } = makeService({
        users: {
          findById: jest
            .fn()
            .mockResolvedValue({ id: 'u1', email: 'a@b.com', tokenVersion: 3 }),
          update,
        },
        claimTokens: {
          consume: jest.fn().mockResolvedValue({ userId: 'u1' }),
        },
      });

      await service.resetPassword({ token: 'raw', password: 'novaSenha123' });

      const patch = patchFrom(update);
      expect(patch.tokenVersion).toBe(4);
      expect(patch.passwordHash).not.toBe('novaSenha123');
      await expect(
        argon2.verify(patch.passwordHash!, 'novaSenha123'),
      ).resolves.toBe(true);
    });

    it('consumes the token under the PASSWORD_RESET purpose only', async () => {
      const consume = jest.fn().mockResolvedValue({ userId: 'u1' });
      const { service } = makeService({
        users: {
          findById: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com' }),
          update: jest.fn().mockResolvedValue({
            id: 'u1',
            email: 'a@b.com',
            name: null,
            role: 'BUYER',
          }),
        },
        claimTokens: { consume },
      });

      await service.resetPassword({ token: 'raw', password: 'novaSenha123' });

      expect(consume).toHaveBeenCalledWith(
        'raw',
        ClaimTokenPurpose.PASSWORD_RESET,
      );
    });
  });

  describe('changePassword', () => {
    function serviceWithUser(passwordHash: string | null) {
      const update = jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'A',
        role: 'BUYER',
        tokenVersion: 2,
      });
      const { service } = makeService({
        users: {
          findByIdWithSecrets: jest
            .fn()
            .mockResolvedValue({ id: 'u1', passwordHash, tokenVersion: 1 }),
          update,
        },
      });
      return { service, update };
    }

    it('rejects a wrong current password', async () => {
      const hash = await argon2.hash('senhaCerta123');
      const { service, update } = serviceWithUser(hash);

      await expect(
        service.changePassword('u1', {
          currentPassword: 'senhaErrada123',
          newPassword: 'novaSenha123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(update).not.toHaveBeenCalled();
    });

    it('requires currentPassword when the account already has one', async () => {
      const hash = await argon2.hash('senhaCerta123');
      const { service, update } = serviceWithUser(hash);

      await expect(
        service.changePassword('u1', { newPassword: 'novaSenha123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('accepts the correct current password and bumps tokenVersion', async () => {
      const hash = await argon2.hash('senhaCerta123');
      const { service, update } = serviceWithUser(hash);

      await service.changePassword('u1', {
        currentPassword: 'senhaCerta123',
        newPassword: 'novaSenha123',
      });

      expect(patchFrom(update).tokenVersion).toBe(2);
    });

    it('lets a magic-link-only account set its first password without one', async () => {
      // Sem passwordHash não há senha atual a confirmar — exigir uma deixaria
      // esse usuário sem caminho para criar senha.
      const { service, update } = serviceWithUser(null);

      await service.changePassword('u1', { newPassword: 'novaSenha123' });

      const patch = patchFrom(update);
      await expect(
        argon2.verify(patch.passwordHash!, 'novaSenha123'),
      ).resolves.toBe(true);
    });
  });
});
