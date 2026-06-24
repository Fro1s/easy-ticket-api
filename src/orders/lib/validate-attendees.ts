import { BadRequestException } from '@nestjs/common';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AttendeeInput = { name: string; email: string | null };

export function validateAttendees(input: {
  qty: number;
  ticketsPerUnit: number;
  attendees: AttendeeInput[] | null;
  requireEmail?: boolean;
}): void {
  const { qty, ticketsPerUnit, attendees, requireEmail = false } = input;
  if (ticketsPerUnit <= 1) return;

  const expected = qty * ticketsPerUnit;
  if (!attendees) {
    throw new BadRequestException('attendees obrigatórios para lotes combo');
  }
  if (attendees.length !== expected) {
    throw new BadRequestException(
      `attendees: esperava quantidade ${expected}, recebeu ${attendees.length}`,
    );
  }
  for (let i = 0; i < attendees.length; i++) {
    const a = attendees[i];
    if (!a?.name || a.name.trim().length < 2) {
      throw new BadRequestException(`attendees[${i}].name inválido`);
    }
    const emailEmpty = a.email == null || a.email === '';
    if (requireEmail && emailEmpty) {
      throw new BadRequestException(`attendees[${i}].email obrigatório`);
    }
    if (!emailEmpty && !EMAIL_RE.test(a.email!)) {
      throw new BadRequestException(`attendees[${i}].email inválido`);
    }
  }
}
