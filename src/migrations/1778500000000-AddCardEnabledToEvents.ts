import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adiciona events.cardEnabled (default true): permite desabilitar cartão por evento. */
export class AddCardEnabledToEvents1778500000000 implements MigrationInterface {
  name = 'AddCardEnabledToEvents1778500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "cardEnabled" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "cardEnabled"`,
    );
  }
}
