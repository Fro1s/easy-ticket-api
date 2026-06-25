import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCombosAndAttendees1778100000000 implements MigrationInterface {
  name = 'AddCombosAndAttendees1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "batches"
      ADD COLUMN IF NOT EXISTS "ticketsPerUnit" int NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "attendees" jsonb NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tickets"
      ADD COLUMN IF NOT EXISTS "holderName" varchar(120) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tickets"
      ADD COLUMN IF NOT EXISTS "holderEmail" varchar(180) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP COLUMN IF EXISTS "holderEmail"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP COLUMN IF EXISTS "holderName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN IF EXISTS "attendees"`,
    );
    await queryRunner.query(
      `ALTER TABLE "batches" DROP COLUMN IF EXISTS "ticketsPerUnit"`,
    );
  }
}
