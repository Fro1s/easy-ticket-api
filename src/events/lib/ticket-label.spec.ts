import { ticketLabel } from './ticket-label';

describe('ticketLabel', () => {
  it('usa o nome do lote quando presente', () => {
    expect(ticketLabel('Promocional', 'Lotes')).toBe('Promocional');
  });
  it('cai no nome do setor quando o lote é null', () => {
    expect(ticketLabel(null, 'Pista')).toBe('Pista');
  });
  it('cai no nome do setor quando o lote é vazio', () => {
    expect(ticketLabel('', 'Pista')).toBe('Pista');
  });
});
