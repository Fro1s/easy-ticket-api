export interface GooglePassInput {
  issuerId: string;
  ticketId: string;
  eventId: string;
  eventTitle: string;
  eventArtist: string;
  startsAtIso: string;
  venueName: string;
  venueCity: string;
  sectorName: string;
  shortCode: string;
  qrToken: string;
  holderName: string | null;
}

/**
 * Classe + objeto inline no JWT "savetowallet": o Google cria ambos na
 * primeira vez que o usuário salva o pass — não precisa provisionar nada
 * via REST antes. https://developers.google.com/wallet/tickets/events
 */
export function buildGoogleWalletPayload(input: GooglePassInput): {
  eventTicketClasses: unknown[];
  eventTicketObjects: unknown[];
} {
  const classId = `${input.issuerId}.easy-ticket-${input.eventId}`;
  const localized = (value: string) => ({
    defaultValue: { language: 'pt-BR', value },
  });

  return {
    eventTicketClasses: [
      {
        id: classId,
        issuerName: 'Easy Ticket',
        reviewStatus: 'UNDER_REVIEW',
        eventName: localized(input.eventArtist),
        venue: {
          name: localized(input.venueName),
          address: localized(input.venueCity),
        },
        dateTime: { start: input.startsAtIso },
      },
    ],
    eventTicketObjects: [
      {
        id: `${input.issuerId}.${input.ticketId}`,
        classId,
        state: 'ACTIVE',
        hexBackgroundColor: '#11111A',
        barcode: {
          type: 'QR_CODE',
          value: input.qrToken,
          alternateText: input.shortCode,
        },
        ticketHolderName: input.holderName ?? undefined,
        ticketNumber: input.shortCode,
        seatInfo: { seat: undefined, section: localized(input.sectorName) },
      },
    ],
  };
}
