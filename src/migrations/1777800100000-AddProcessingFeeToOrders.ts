import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessingFeeToOrders1777800100000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "orders" ADD COLUMN "processingFeeCents" integer NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "orders" ADD COLUMN "processingFeeMethod" "public"."orders_paymentmethod_enum" NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "orders" DROP COLUMN "processingFeeMethod"`);
    await q.query(`ALTER TABLE "orders" DROP COLUMN "processingFeeCents"`);
  }
}
