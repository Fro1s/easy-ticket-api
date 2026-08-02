/**
 * Estado da varredura de pedidos PENDENTES vencidos (`orders:expire-stale`).
 *
 * O cron acorda de minuto em minuto, mas CADA consulta ao banco acorda o
 * compute do Neon — e um compute que nunca suspende queima a cota mensal de
 * CU-hrs mesmo sem ninguém comprando. Como a API roda em instância única (ver
 * `min_machines_running` no fly.toml), dá para saber em memória se existe algo
 * a expirar e pular o banco quando não existe.
 *
 * `lastSweptAt` sustenta a rede de segurança: mesmo com o estado em memória
 * dizendo que não há nada pendente, uma varredura periódica confirma no banco.
 * Isso cobre divergências (ex.: linha escrita fora do processo) sem depender do
 * estado em memória estar perfeito.
 */
export interface SweepState {
  /** Quando o pedido pendente mais próximo vence. `null` = nada pendente. */
  nextExpiryAt: Date | null;
  /** Última varredura que efetivamente consultou o banco. */
  lastSweptAt: Date;
}

/**
 * A varredura deste minuto precisa consultar o banco? Só quando há reserva
 * vencida para liberar, ou quando a rede de segurança venceu.
 */
export function shouldSweep(
  state: SweepState,
  now: Date,
  safetyIntervalMs: number,
): boolean {
  if (state.nextExpiryAt !== null && state.nextExpiryAt.getTime() <= now.getTime()) {
    return true;
  }
  return now.getTime() - state.lastSweptAt.getTime() >= safetyIntervalMs;
}

/**
 * Registra uma reserva recém-criada. Guarda apenas a que vence primeiro — é ela
 * que define quando a próxima varredura vale a pena.
 */
export function trackPendingOrder(
  state: SweepState,
  reservedUntil: Date,
): SweepState {
  const isEarlier =
    state.nextExpiryAt === null ||
    reservedUntil.getTime() < state.nextExpiryAt.getTime();

  return isEarlier ? { ...state, nextExpiryAt: reservedUntil } : state;
}

/**
 * Fecha uma varredura: adota a expiração do pendente mais próximo que sobrou
 * (`null` se não sobrou nenhum) e reinicia a janela da rede de segurança.
 */
export function afterSweep(
  state: SweepState,
  nextExpiryAt: Date | null,
  now: Date,
): SweepState {
  return { ...state, nextExpiryAt, lastSweptAt: now };
}
