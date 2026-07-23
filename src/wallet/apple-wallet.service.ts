import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { PKPass } from 'passkit-generator';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import { Sector } from '../events/entities/sector.entity';

@Injectable()
export class AppleWalletService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async buildPass(
    userId: string,
    ticketId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const passTypeId = this.config.get<string>('APPLE_PASS_TYPE_ID');
    const teamId = this.config.get<string>('APPLE_TEAM_ID');
    const certB64 = this.config.get<string>('APPLE_PASS_CERT_BASE64');
    const keyB64 = this.config.get<string>('APPLE_PASS_KEY_BASE64');
    const wwdrB64 = this.config.get<string>('APPLE_WWDR_CERT_BASE64');
    if (!passTypeId || !teamId || !certB64 || !keyB64 || !wwdrB64) {
      throw new ServiceUnavailableException('apple wallet not configured');
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

    const pass = await PKPass.from(
      {
        model: join(process.cwd(), 'assets', 'easyticket.pass'),
        certificates: {
          wwdr: Buffer.from(wwdrB64, 'base64'),
          signerCert: Buffer.from(certB64, 'base64'),
          signerKey: Buffer.from(keyB64, 'base64'),
          signerKeyPassphrase:
            this.config.get<string>('APPLE_PASS_KEY_PASSPHRASE') || undefined,
        },
      },
      {
        passTypeIdentifier: passTypeId,
        teamIdentifier: teamId,
        serialNumber: ticket.id,
        description: `Ingresso ${event.artist}`,
      },
    );

    pass.setBarcodes({
      message: ticket.qrToken,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText: ticket.shortCode,
    });
    pass.setRelevantDate(event.startsAt);
    pass.primaryFields.push({
      key: 'event',
      label: 'EVENTO',
      value: event.artist,
    });
    pass.secondaryFields.push({
      key: 'venue',
      label: 'LOCAL',
      value: `${event.venue?.name ?? ''} · ${event.venue?.city ?? ''}`,
    });
    pass.auxiliaryFields.push(
      {
        key: 'date',
        label: 'DATA',
        value: event.startsAt.toLocaleString('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'America/Sao_Paulo',
        }),
      },
      { key: 'sector', label: 'SETOR', value: sector?.name ?? '' },
    );
    if (ticket.holderName) {
      pass.backFields.push({
        key: 'holder',
        label: 'PORTADOR',
        value: ticket.holderName,
      });
    }

    return {
      buffer: pass.getAsBuffer(),
      filename: `${ticket.shortCode}.pkpass`,
    };
  }
}
