import { MigrationInterface, QueryRunner } from 'typeorm';

/** tickets.batchId (nullable): grava de qual lote o ingresso foi emitido. */
export class AddBatchIdToTickets1778600000000 implements MigrationInterface {
  name = 'AddBatchIdToTickets1778600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "batchId" varchar(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP COLUMN IF EXISTS "batchId"`,
    );
  }
}
