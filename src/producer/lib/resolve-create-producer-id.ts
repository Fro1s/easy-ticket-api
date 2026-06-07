import { BadRequestException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';

export interface ResolveCreateProducerIdInput {
  role: Role;
  /** producerId vinculado ao usuário autenticado (null se não houver). */
  ownProducerId: string | null;
  /** producerId explícito informado no payload (só faz sentido p/ ADMIN). */
  dtoProducerId: string | undefined;
}

/**
 * Decide a qual produtor um novo evento pertence.
 *
 * Regra: o evento SEMPRE tem um dono explícito. Antes, um ADMIN sem vínculo
 * caía num fallback que pegava "qualquer produtor" (o primeiro da tabela) —
 * causando eventos atribuídos ao produtor errado e vazando para o painel de
 * outro produtor. Agora, na ausência de um dono determinável, rejeitamos.
 */
export function resolveCreateProducerId(
  input: ResolveCreateProducerIdInput,
): string {
  const { role, ownProducerId, dtoProducerId } = input;

  if (role === Role.ADMIN) {
    // ADMIN pode mirar um produtor explícito; senão usa o próprio vínculo.
    const target = dtoProducerId ?? ownProducerId;
    if (!target) {
      throw new BadRequestException(
        'admin must specify a producerId for the event',
      );
    }
    return target;
  }

  // PRODUCER/STAFF: sempre o próprio produtor. Sem vínculo = erro.
  if (!ownProducerId) {
    throw new BadRequestException('user has no producer linked');
  }
  return ownProducerId;
}
