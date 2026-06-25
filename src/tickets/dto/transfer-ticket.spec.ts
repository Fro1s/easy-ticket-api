import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TransferTicketDto } from './transfer-ticket.dto';

function errorsFor(obj: Record<string, unknown>) {
  return validateSync(plainToInstance(TransferTicketDto, obj));
}

describe('TransferTicketDto', () => {
  it('aceita email sozinho', () => {
    expect(errorsFor({ email: 'maria@gmail.com' })).toHaveLength(0);
  });

  it('aceita CPF formatado sozinho (normaliza para 11 dígitos)', () => {
    const dto = plainToInstance(TransferTicketDto, { cpf: '123.456.789-00' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.cpf).toBe('12345678900');
  });

  it('rejeita quando nem email nem cpf vêm', () => {
    expect(errorsFor({}).length).toBeGreaterThan(0);
  });

  it('rejeita CPF com menos de 11 dígitos', () => {
    expect(errorsFor({ cpf: '123' }).length).toBeGreaterThan(0);
  });

  it('rejeita email inválido', () => {
    expect(errorsFor({ email: 'nao-eh-email' }).length).toBeGreaterThan(0);
  });
});
