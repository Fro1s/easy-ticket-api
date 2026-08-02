import { afterSweep, shouldSweep, trackPendingOrder } from './expiry-sweep';

// O cron de expiração roda de minuto em minuto, mas cada consulta ao banco
// acorda o compute do Neon (e queima CU-hrs). Estas funções decidem quando a
// varredura PRECISA tocar o banco: só quando existe pedido pendente vencido,
// ou quando a rede de segurança venceu.

const SIX_HOURS_MS = 6 * 60 * 60_000;
const now = new Date('2026-08-02T12:00:00Z');

describe('shouldSweep', () => {
  it('NÃO varre quando não há pedido pendente e a rede de segurança não venceu', () => {
    const state = {
      nextExpiryAt: null,
      lastSweptAt: new Date('2026-08-02T11:59:00Z'),
    };
    expect(shouldSweep(state, now, SIX_HOURS_MS)).toBe(false);
  });

  it('varre quando o pedido pendente mais próximo já venceu', () => {
    const state = {
      nextExpiryAt: new Date('2026-08-02T11:58:00Z'),
      lastSweptAt: new Date('2026-08-02T11:59:00Z'),
    };
    expect(shouldSweep(state, now, SIX_HOURS_MS)).toBe(true);
  });

  it('NÃO varre quando o pedido pendente ainda está dentro do prazo', () => {
    const state = {
      nextExpiryAt: new Date('2026-08-02T12:05:00Z'),
      lastSweptAt: new Date('2026-08-02T11:59:00Z'),
    };
    expect(shouldSweep(state, now, SIX_HOURS_MS)).toBe(false);
  });

  it('varre no instante exato em que a reserva vence', () => {
    const state = { nextExpiryAt: now, lastSweptAt: new Date(now) };
    expect(shouldSweep(state, now, SIX_HOURS_MS)).toBe(true);
  });

  it('varre pela rede de segurança mesmo sem pedido pendente conhecido', () => {
    const state = {
      nextExpiryAt: null,
      lastSweptAt: new Date('2026-08-02T05:59:00Z'),
    };
    expect(shouldSweep(state, now, SIX_HOURS_MS)).toBe(true);
  });
});

describe('trackPendingOrder', () => {
  it('registra o primeiro pedido pendente quando não havia nenhum', () => {
    const state = { nextExpiryAt: null, lastSweptAt: now };
    const reservedUntil = new Date('2026-08-02T12:10:00Z');

    expect(trackPendingOrder(state, reservedUntil).nextExpiryAt).toEqual(
      reservedUntil,
    );
  });

  it('adianta para a reserva que vence antes', () => {
    const state = {
      nextExpiryAt: new Date('2026-08-02T12:10:00Z'),
      lastSweptAt: now,
    };
    const maisCedo = new Date('2026-08-02T12:03:00Z');

    expect(trackPendingOrder(state, maisCedo).nextExpiryAt).toEqual(maisCedo);
  });

  it('mantém a reserva mais próxima quando chega uma que vence depois', () => {
    const maisCedo = new Date('2026-08-02T12:03:00Z');
    const state = { nextExpiryAt: maisCedo, lastSweptAt: now };

    const next = trackPendingOrder(state, new Date('2026-08-02T12:10:00Z'));

    expect(next.nextExpiryAt).toEqual(maisCedo);
  });

  it('não altera lastSweptAt — registrar um pedido não é uma varredura', () => {
    const state = {
      nextExpiryAt: null,
      lastSweptAt: new Date('2026-08-02T06:00:00Z'),
    };

    const next = trackPendingOrder(state, new Date('2026-08-02T12:10:00Z'));

    expect(next.lastSweptAt).toEqual(state.lastSweptAt);
  });
});

describe('afterSweep', () => {
  it('zera a próxima expiração quando não sobrou pedido pendente', () => {
    const state = {
      nextExpiryAt: new Date('2026-08-02T11:58:00Z'),
      lastSweptAt: new Date('2026-08-02T06:00:00Z'),
    };

    expect(afterSweep(state, null, now).nextExpiryAt).toBeNull();
  });

  it('adota a expiração do pendente mais próximo que sobrou', () => {
    const state = {
      nextExpiryAt: new Date('2026-08-02T11:58:00Z'),
      lastSweptAt: new Date('2026-08-02T06:00:00Z'),
    };
    const restante = new Date('2026-08-02T12:07:00Z');

    expect(afterSweep(state, restante, now).nextExpiryAt).toEqual(restante);
  });

  it('reinicia a janela da rede de segurança', () => {
    const state = {
      nextExpiryAt: null,
      lastSweptAt: new Date('2026-08-02T06:00:00Z'),
    };

    const next = afterSweep(state, null, now);

    expect(next.lastSweptAt).toEqual(now);
    expect(shouldSweep(next, now, SIX_HOURS_MS)).toBe(false);
  });
});
