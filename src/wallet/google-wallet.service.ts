import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { sign } from 'jsonwebtoken';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import { Sector } from '../events/entities/sector.entity';
import { buildGoogleWalletPayload } from './lib/build-google-pass';
import { GoogleWalletSaveResponse } from './dto/wallet.response';

@Injectable()
export class GoogleWalletService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async saveUrl(
    userId: string,
    ticketId: string,
  ): Promise<GoogleWalletSaveResponse> {
    const issuerId = this.config.get<string>('GOOGLE_WALLET_ISSUER_ID');
    const saEmail = this.config.get<string>('GOOGLE_WALLET_SA_EMAIL');
    const keyB64 = this.config.get<string>('GOOGLE_WALLET_SA_KEY_BASE64');
    if (!issuerId || !saEmail || !keyB64) {
      throw new ServiceUnavailableException('google wallet not configured');
    }

    const ticket = await this.dataSource
      .getRepository(Ticket)
      .findOne({ where: { id: ticketId, userId } });
    if (!ticket) throw new NotFoundException('ticket not found');

    const event = await this.dataSource.getRepository(Event).findOne({
      where: { id: ticket.eventId },
      relations: { venue: true },
    });
    const sector = await this.dataSource
      .getRepository(Sector)
      .findOne({ where: { id: ticket.sectorId } });
    if (!event) throw new NotFoundException('event not found');

    const payload = buildGoogleWalletPayload({
      issuerId,
      ticketId: ticket.id,
      eventId: ticket.eventId,
      eventTitle: event.title,
      eventArtist: event.artist,
      startsAtIso: event.startsAt.toISOString(),
      venueName: event.venue?.name ?? '',
      venueCity: event.venue?.city ?? '',
      sectorName: sector?.name ?? '',
      shortCode: ticket.shortCode,
      qrToken: ticket.qrToken,
      holderName: ticket.holderName,
    });

    const privateKey = Buffer.from(keyB64, 'base64').toString('utf8');
    const webBaseUrl =
      this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
    const jwt = sign(
      {
        iss: saEmail,
        aud: 'google',
        typ: 'savetowallet',
        origins: [webBaseUrl],
        payload,
      },
      privateKey,
      { algorithm: 'RS256' },
    );
    return { saveUrl: `https://pay.google.com/gp/v/save/${jwt}` };
  }
}
