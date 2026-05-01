import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropBoletoMethod1777800000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "orders" SET "paymentMethod" = 'PIX' WHERE "paymentMethod" = 'BOLETO'`);
    await q.query(`ALTER TYPE "public"."orders_paymentmethod_enum" RENAME TO "orders_paymentmethod_enum_old"`);
    await q.query(`CREATE TYPE "public"."orders_paymentmethod_enum" AS ENUM ('PIX','CARD')`);
    await q.query(`ALTER TABLE "orders" ALTER COLUMN "paymentMethod" TYPE "public"."orders_paymentmethod_enum" USING "paymentMethod"::text::"public"."orders_paymentmethod_enum"`);
    await q.query(`DROP TYPE "public"."orders_paymentmethod_enum_old"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."orders_paymentmethod_enum" RENAME TO "orders_paymentmethod_enum_old"`);
    await q.query(`CREATE TYPE "public"."orders_paymentmethod_enum" AS ENUM ('PIX','CARD','BOLETO')`);
    await q.query(`ALTER TABLE "orders" ALTER COLUMN "paymentMethod" TYPE "public"."orders_paymentmethod_enum" USING "paymentMethod"::text::"public"."orders_paymentmethod_enum"`);
    await q.query(`DROP TYPE "public"."orders_paymentmethod_enum_old"`);
  }
}
