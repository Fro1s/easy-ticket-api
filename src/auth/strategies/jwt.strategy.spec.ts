import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Stub UsersService so its transitive ESM dep (@paralleldrive/cuid2) is never
// loaded by Jest. We only need the type/shape here, injected as a plain mock.
jest.mock('../../users/users.service', () => ({ UsersService: class {} }));
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { Role } from '../../common/enums/role.enum';

/**
 * Regressão do vazamento de escopo entre produtores: o token deve identificar
 * o usuário pelo `sub` (id imutável), nunca pelo e-mail (mutável e — antes do
 * fix de normalização — não-único por causa de caixa). Resolver por e-mail
 * permitia que o request "virasse" outra linha de usuário com o mesmo e-mail.
 */
describe('JwtStrategy.validate', () => {
  const config = {
    getOrThrow: () => 'test-secret',
  } as unknown as ConfigService;

  function makeStrategy(users: Partial<UsersService>) {
    return new JwtStrategy(config, users as UsersService);
  }

  it('resolves the user by id (sub), not by email', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: 'real-id',
      email: 'sandman@example.com',
      role: Role.PRODUCER,
    });
    const findByEmail = jest.fn();
    const strategy = makeStrategy({ findById, findByEmail });

    const result = await strategy.validate({
      sub: 'real-id',
      email: 'sandman@example.com',
      role: Role.PRODUCER,
    });

    expect(findById).toHaveBeenCalledWith('real-id');
    expect(findByEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'real-id',
      email: 'sandman@example.com',
      role: Role.PRODUCER,
    });
  });

  it('throws Unauthorized when the id no longer exists', async () => {
    const strategy = makeStrategy({
      findById: jest.fn().mockResolvedValue(null),
    });
    await expect(
      strategy.validate({ sub: 'gone', email: 'x@y.com', role: Role.BUYER }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the live role/email from the db row, not the token claims', async () => {
    // token says ADMIN but db says BUYER → must trust the db row
    const strategy = makeStrategy({
      findById: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'live@example.com',
        role: Role.BUYER,
      }),
    });
    const result = await strategy.validate({
      sub: 'u1',
      email: 'stale@example.com',
      role: Role.ADMIN,
    });
    expect(result.role).toBe(Role.BUYER);
    expect(result.email).toBe('live@example.com');
  });
});
