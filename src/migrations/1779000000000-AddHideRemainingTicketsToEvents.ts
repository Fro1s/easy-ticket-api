import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona events.hideRemainingTickets (default false): esconde do público a
 * quantidade de ingressos restantes. Nasce desligada, então nenhum evento
 * existente muda de comportamento.
 */
export class AddHideRemainingTicketsToEvents1779000000000
  implements MigrationInterface
{
  name = 'AddHideRemainingTicketsToEvents1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "hideRemainingTickets" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "hideRemainingTickets"`,
    );
  }
}
