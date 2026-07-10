import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Endurecimento de segurança:
 * - users.tokenVersion: permite revogar refresh tokens (troca de senha/claim).
 * - Índice único parcial em orders.paymentId: impede emissão dupla de ingressos
 *   quando o gateway reenvia o mesmo webhook em paralelo.
 */
export class SecurityHardening1778700000000 implements MigrationInterface {
  name = 'SecurityHardening1778700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_orders_paymentId" ON "orders" ("paymentId") WHERE "paymentId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_orders_paymentId"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "tokenVersion"`,
    );
  }
}
