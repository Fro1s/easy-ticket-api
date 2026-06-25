import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateProducerDto } from './create-producer.dto';
import { CreateProducerUserDto } from './create-producer-user.dto';
import { ReassignEventDto } from './reassign-event.dto';

const errs = (cls: any, obj: Record<string, unknown>) =>
  validateSync(plainToInstance(cls, obj));

describe('admin DTOs', () => {
  it('CreateProducerDto accepts name only', () => {
    expect(errs(CreateProducerDto, { name: 'Warung' })).toHaveLength(0);
  });
  it('CreateProducerDto rejects empty name', () => {
    expect(errs(CreateProducerDto, { name: '' }).length).toBeGreaterThan(0);
  });
  it('CreateProducerUserDto accepts valid input', () => {
    expect(
      errs(CreateProducerUserDto, {
        name: 'Letícia',
        email: 'a@b.com',
        password: 'pcf2026!',
      }),
    ).toHaveLength(0);
  });
  it('CreateProducerUserDto rejects bad email', () => {
    expect(
      errs(CreateProducerUserDto, {
        name: 'X',
        email: 'nope',
        password: 'pcf2026!',
      }).length,
    ).toBeGreaterThan(0);
  });
  it('CreateProducerUserDto rejects short password', () => {
    expect(
      errs(CreateProducerUserDto, {
        name: 'X',
        email: 'a@b.com',
        password: '123',
      }).length,
    ).toBeGreaterThan(0);
  });
  it('ReassignEventDto requires producerId', () => {
    expect(errs(ReassignEventDto, {}).length).toBeGreaterThan(0);
  });
});
