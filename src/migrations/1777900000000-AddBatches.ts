import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBatches1777900000000 implements MigrationInterface {
  name = 'AddBatches1777900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "batches" (
        "id" varchar(32) NOT NULL,
        "sectorId" varchar(32) NOT NULL,
        "name" varchar(80) NOT NULL,
        "priceCents" int NOT NULL,
        "capacity" int NOT NULL,
        "sold" int NOT NULL DEFAULT 0,
        "reserved" int NOT NULL DEFAULT 0,
        "sortOrder" int NOT NULL DEFAULT 0,
        "startsAt" timestamptz NULL,
        "endsAt" timestamptz NULL,
        CONSTRAINT "PK_batches" PRIMARY KEY ("id"),
        CONSTRAINT "FK_batches_sector" FOREIGN KEY ("sectorId")
          REFERENCES "sectors"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_batches_sector_sortOrder" ON "batches" ("sectorId", "sortOrder")`,
    );

    await queryRunner.query(`ALTER TABLE "sectors" DROP COLUMN "priceCents"`);

    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "batchId" varchar(32) NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_batch" FOREIGN KEY ("batchId")
      REFERENCES "batches"("id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_batch"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "batchId"`);
    await queryRunner.query(`ALTER TABLE "sectors" ADD COLUMN "priceCents" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`DROP INDEX "IDX_batches_sector_sortOrder"`);
    await queryRunner.query(`DROP TABLE "batches"`);
  }
}
