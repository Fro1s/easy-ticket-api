import { BadRequestException } from '@nestjs/common';
import { resolveCreateProducerId } from './resolve-create-producer-id';
import { Role } from '../../common/enums/role.enum';

describe('resolveCreateProducerId', () => {
  it('uses the PRODUCER own producerId', () => {
    expect(
      resolveCreateProducerId({
        role: Role.PRODUCER,
        ownProducerId: 'prod-1',
        dtoProducerId: undefined,
      }),
    ).toBe('prod-1');
  });

  it('throws if a PRODUCER somehow has no producerId', () => {
    expect(() =>
      resolveCreateProducerId({
        role: Role.PRODUCER,
        ownProducerId: null,
        dtoProducerId: undefined,
      }),
    ).toThrow(BadRequestException);
  });

  it('lets an ADMIN that is also linked to a producer use that link', () => {
    expect(
      resolveCreateProducerId({
        role: Role.ADMIN,
        ownProducerId: 'prod-admin',
        dtoProducerId: undefined,
      }),
    ).toBe('prod-admin');
  });

  it('lets an ADMIN target an explicit producer via the dto', () => {
    expect(
      resolveCreateProducerId({
        role: Role.ADMIN,
        ownProducerId: null,
        dtoProducerId: 'prod-target',
      }),
    ).toBe('prod-target');
  });

  it('REJECTS an ADMIN with no link and no explicit producer (no arbitrary fallback)', () => {
    // This was the bug: the old code grabbed "any producer" → wrong owner.
    expect(() =>
      resolveCreateProducerId({
        role: Role.ADMIN,
        ownProducerId: null,
        dtoProducerId: undefined,
      }),
    ).toThrow(BadRequestException);
  });
});
