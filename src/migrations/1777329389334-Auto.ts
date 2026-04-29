import { MigrationInterface, QueryRunner } from "typeorm";

export class Auto1777329389334 implements MigrationInterface {
    name = 'Auto1777329389334'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "manual_payments" ("id" character varying(32) NOT NULL, "orderId" character varying(32) NOT NULL, "confirmedByUserId" character varying(32) NOT NULL, "reference" character varying(200), "confirmedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ba8e2713a54df8b728429c5907f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_989e04797f9004783b9a0e08a3" ON "manual_payments" ("orderId") `);
        await queryRunner.query(`CREATE TYPE "public"."claim_tokens_purpose_enum" AS ENUM('CLAIM', 'MAGIC_LINK')`);
        await queryRunner.query(`CREATE TABLE "claim_tokens" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "token" character varying(96) NOT NULL, "purpose" "public"."claim_tokens_purpose_enum" NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_84f315cddfd259d7c459a02192b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1a6bb82fda4854ec84bcb12dce" ON "claim_tokens" ("token") `);
        await queryRunner.query(`CREATE TYPE "public"."events_paymentprovider_enum" AS ENUM('MANUAL_PIX', 'ABACATE_PAY')`);
        await queryRunner.query(`ALTER TABLE "events" ADD "paymentProvider" "public"."events_paymentprovider_enum" NOT NULL DEFAULT 'MANUAL_PIX'`);
        await queryRunner.query(`ALTER TABLE "events" ADD "pixKey" character varying(140)`);
        await queryRunner.query(`CREATE TYPE "public"."events_pixkeytype_enum" AS ENUM('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM')`);
        await queryRunner.query(`ALTER TABLE "events" ADD "pixKeyType" "public"."events_pixkeytype_enum"`);
        await queryRunner.query(`ALTER TABLE "events" ADD "pixHolderName" character varying(160)`);
        await queryRunner.query(`ALTER TABLE "events" ADD "platformFeeRate" numeric(5,4) NOT NULL DEFAULT '0.025'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "producerId" character varying(32)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "claimedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "producers" ALTER COLUMN "cnpj" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "cpf" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_7113eb848c48c0f621c22745b13" FOREIGN KEY ("producerId") REFERENCES "producers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "manual_payments" ADD CONSTRAINT "FK_989e04797f9004783b9a0e08a36" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "manual_payments" ADD CONSTRAINT "FK_82f15664acbbffb36e85b04e818" FOREIGN KEY ("confirmedByUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "claim_tokens" ADD CONSTRAINT "FK_cf13aa54e863cf823ed50dcd6fc" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "claim_tokens" DROP CONSTRAINT "FK_cf13aa54e863cf823ed50dcd6fc"`);
        await queryRunner.query(`ALTER TABLE "manual_payments" DROP CONSTRAINT "FK_82f15664acbbffb36e85b04e818"`);
        await queryRunner.query(`ALTER TABLE "manual_payments" DROP CONSTRAINT "FK_989e04797f9004783b9a0e08a36"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_7113eb848c48c0f621c22745b13"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "cpf" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "producers" ALTER COLUMN "cnpj" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "claimedAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "producerId"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "platformFeeRate"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "pixHolderName"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "pixKeyType"`);
        await queryRunner.query(`DROP TYPE "public"."events_pixkeytype_enum"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "pixKey"`);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "paymentProvider"`);
        await queryRunner.query(`DROP TYPE "public"."events_paymentprovider_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1a6bb82fda4854ec84bcb12dce"`);
        await queryRunner.query(`DROP TABLE "claim_tokens"`);
        await queryRunner.query(`DROP TYPE "public"."claim_tokens_purpose_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_989e04797f9004783b9a0e08a3"`);
        await queryRunner.query(`DROP TABLE "manual_payments"`);
    }

}
