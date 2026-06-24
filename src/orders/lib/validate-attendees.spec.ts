import { validateAttendees } from './validate-attendees';

describe('validateAttendees', () => {
  it('aceita lote não-combo (ticketsPerUnit=1) sem attendees', () => {
    expect(() =>
      validateAttendees({ qty: 2, ticketsPerUnit: 1, attendees: null }),
    ).not.toThrow();
  });

  it('exige attendees quando ticketsPerUnit > 1', () => {
    expect(() =>
      validateAttendees({ qty: 1, ticketsPerUnit: 5, attendees: null }),
    ).toThrow(/attendees obrigat/i);
  });

  it('exige tamanho igual a qty * ticketsPerUnit', () => {
    expect(() =>
      validateAttendees({
        qty: 1,
        ticketsPerUnit: 5,
        attendees: [{ name: 'Ana Silva', email: null }],
      }),
    ).toThrow(/quantidade 5/i);
  });

  it('rejeita nome com menos de 2 caracteres', () => {
    const five = Array.from({ length: 5 }, () => ({ name: 'A', email: null }));
    expect(() =>
      validateAttendees({ qty: 1, ticketsPerUnit: 5, attendees: five }),
    ).toThrow(/name inv/i);
  });

  it('rejeita email malformado', () => {
    const attendees = [
      { name: 'Ana Silva', email: 'nao-eh-email' },
      ...Array.from({ length: 4 }, () => ({ name: 'Outro Nome', email: null })),
    ];
    expect(() =>
      validateAttendees({ qty: 1, ticketsPerUnit: 5, attendees }),
    ).toThrow(/email inv/i);
  });

  it('aceita lista válida', () => {
    const attendees = Array.from({ length: 10 }, (_, i) => ({
      name: `Convidado ${i}`,
      email: i % 2 === 0 ? `c${i}@x.com` : null,
    }));
    expect(() =>
      validateAttendees({ qty: 2, ticketsPerUnit: 5, attendees }),
    ).not.toThrow();
  });
});

describe('validateAttendees — requireEmail', () => {
  const five = (email: string | null) =>
    Array.from({ length: 5 }, () => ({ name: 'Ana Silva', email }));

  it('requireEmail=true rejeita email vazio', () => {
    expect(() =>
      validateAttendees({ qty: 1, ticketsPerUnit: 5, attendees: five(''), requireEmail: true }),
    ).toThrow(/email/i);
  });

  it('requireEmail=true rejeita email null', () => {
    expect(() =>
      validateAttendees({ qty: 1, ticketsPerUnit: 5, attendees: five(null), requireEmail: true }),
    ).toThrow(/email/i);
  });

  it('requireEmail=true aceita todos com email válido', () => {
    expect(() =>
      validateAttendees({ qty: 1, ticketsPerUnit: 5, attendees: five('a@x.com'), requireEmail: true }),
    ).not.toThrow();
  });

  it('requireEmail=true permite emails repetidos', () => {
    expect(() =>
      validateAttendees({ qty: 1, ticketsPerUnit: 5, attendees: five('mesmo@x.com'), requireEmail: true }),
    ).not.toThrow();
  });

  it('requireEmail ausente (default) mantém email opcional', () => {
    expect(() =>
      validateAttendees({ qty: 1, ticketsPerUnit: 5, attendees: five(null) }),
    ).not.toThrow();
  });
});
