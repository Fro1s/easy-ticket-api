import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsActiveToBatches1778200000000 implements MigrationInterface {
  name = 'AddIsActiveToBatches1778200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "batches"
      ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "batches" DROP COLUMN IF EXISTS "isActive"
    `);
  }
}
