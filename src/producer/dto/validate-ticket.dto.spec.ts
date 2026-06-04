import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ValidateTicketDto } from './validate-ticket.dto';

function errorsFor(obj: Record<string, unknown>) {
  return validateSync(plainToInstance(ValidateTicketDto, obj));
}

describe('ValidateTicketDto', () => {
  it('accepts a qrToken alone', () => {
    expect(errorsFor({ qrToken: 'et:o:1' })).toHaveLength(0);
  });
  it('accepts a ticketId alone', () => {
    expect(errorsFor({ ticketId: 'abc123' })).toHaveLength(0);
  });
  it('accepts a shortCode alone', () => {
    expect(errorsFor({ shortCode: 'ET-ABC123XYZ' })).toHaveLength(0);
  });
  it('rejects when none of the three keys is present', () => {
    expect(errorsFor({}).length).toBeGreaterThan(0);
  });
});
