export interface TicketWhatsAppPayload {
  buyerFirstName: string | null;
  eventArtist: string;
  eventTitle: string;
  eventStartsAt: Date;
  venueName: string;
  venueCity: string;
  tickets: Array<{ shortCode: string; sectorName: string; url: string }>;
}

export function buildTicketMessage(p: TicketWhatsAppPayload): string {
  const date = p.eventStartsAt.toLocaleString('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
  const greeting = p.buyerFirstName ? `Olá, ${p.buyerFirstName}!` : 'Olá!';
  const many = p.tickets.length > 1;
  const lines = p.tickets.map(
    (t) => `🎟️ ${t.sectorName} · ${t.shortCode}\n${t.url}`,
  );
  return [
    `${greeting} Seu${many ? 's' : ''} ingresso${many ? 's' : ''} pra *${p.eventArtist}* ${many ? 'chegaram' : 'chegou'}! 🎉`,
    '',
    `📅 ${date}`,
    `📍 ${p.venueName}, ${p.venueCity}`,
    '',
    ...lines,
    '',
    'Apresente o QR do link na portaria. Não precisa imprimir.',
  ].join('\n');
}
