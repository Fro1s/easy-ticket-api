import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProducerOnlyToBatches1778000000000
  implements MigrationInterface
{
  name = 'AddProducerOnlyToBatches1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "batches"
      ADD COLUMN IF NOT EXISTS "producerOnly" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "batches" DROP COLUMN IF EXISTS "producerOnly"
    `);
  }
}
