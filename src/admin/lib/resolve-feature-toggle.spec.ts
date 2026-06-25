import { BadRequestException } from '@nestjs/common';
import { resolveFeatureToggle } from './resolve-feature-toggle';
import { EventStatus } from '../../common/enums/event-status.enum';

describe('resolveFeatureToggle', () => {
  it('marca: retorna setTarget=true para destacar um evento PUBLISHED', () => {
    const r = resolveFeatureToggle({
      status: EventStatus.PUBLISHED,
      featured: true,
    });
    expect(r.setTarget).toBe(true);
    expect(r.clearOthers).toBe(true);
  });
  it('desmarca: setTarget=false e não mexe nos outros', () => {
    const r = resolveFeatureToggle({
      status: EventStatus.PUBLISHED,
      featured: false,
    });
    expect(r.setTarget).toBe(false);
    expect(r.clearOthers).toBe(false);
  });
  it('rejeita destacar um evento que não está PUBLISHED', () => {
    expect(() =>
      resolveFeatureToggle({ status: EventStatus.ARCHIVED, featured: true }),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveFeatureToggle({ status: EventStatus.DRAFT, featured: true }),
    ).toThrow(BadRequestException);
  });
  it('permite desmarcar mesmo um evento não-PUBLISHED (idempotente)', () => {
    const r = resolveFeatureToggle({
      status: EventStatus.ARCHIVED,
      featured: false,
    });
    expect(r.setTarget).toBe(false);
  });
});
