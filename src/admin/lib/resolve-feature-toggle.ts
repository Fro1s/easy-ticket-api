import { BadRequestException } from '@nestjs/common';
import { EventStatus } from '../../common/enums/event-status.enum';

export interface ResolveFeatureToggleInput {
  status: EventStatus;
  featured: boolean;
}
export interface FeatureToggleEffect {
  /** Grava featuredAt=now() no evento alvo. */
  setTarget: boolean;
  /** Zera featuredAt de todos os outros eventos. */
  clearOthers: boolean;
}
/**
 * Só é possível destacar um evento PUBLISHED. Desmarcar é sempre permitido
 * (idempotente). Marcar implica zerar o destaque dos demais (só 1 ativo).
 */
export function resolveFeatureToggle(input: ResolveFeatureToggleInput): FeatureToggleEffect {
  if (input.featured) {
    if (input.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('só é possível destacar um evento publicado');
    }
    return { setTarget: true, clearOthers: true };
  }
  return { setTarget: false, clearOthers: false };
}
