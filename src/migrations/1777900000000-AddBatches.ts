import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBatches1777900000000 implements MigrationInterface {
  name = 'AddBatches1777900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "batches" (
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
      `CREATE INDEX IF NOT EXISTS "IDX_batches_sector_sortOrder" ON "batches" ("sectorId", "sortOrder")`,
    );

    await queryRunner.query(`
      INSERT INTO "batches" (
        "id", "sectorId", "name", "priceCents", "capacity", "sold",
        "reserved", "sortOrder", "startsAt", "endsAt"
      )
      SELECT
        md5(s."id" || ':lote-1'),
        s."id",
        'Lote 1',
        s."priceCents",
        s."capacity",
        s."sold",
        s."reserved",
        1,
        NULL,
        NULL
      FROM "sectors" s
      WHERE NOT EXISTS (
        SELECT 1 FROM "batches" b WHERE b."sectorId" = s."id"
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "batchId" varchar(32)`,
    );
    await queryRunner.query(`
      UPDATE "order_items" oi
      SET "batchId" = md5(oi."sectorId" || ':lote-1')
      WHERE oi."batchId" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items" ALTER COLUMN "batchId" SET NOT NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_order_items_batch'
        ) THEN
          ALTER TABLE "order_items"
          ADD CONSTRAINT "FK_order_items_batch" FOREIGN KEY ("batchId")
          REFERENCES "batches"("id");
        END IF;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "sectors" DROP COLUMN IF EXISTS "priceCents"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_batch"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "batchId"`);
    await queryRunner.query(`ALTER TABLE "sectors" ADD COLUMN IF NOT EXISTS "priceCents" int NOT NULL DEFAULT 0`);
    await queryRunner.query(`
      UPDATE "sectors" s
      SET "priceCents" = b."priceCents"
      FROM "batches" b
      WHERE b."sectorId" = s."id" AND b."sortOrder" = 1
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_batches_sector_sortOrder"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "batches"`);
  }
}
