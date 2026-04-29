import { MigrationInterface, QueryRunner } from "typeorm";

export class Auto1776897660074 implements MigrationInterface {
    name = 'Auto1776897660074'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "producers" ("id" character varying(32) NOT NULL, "name" character varying(160) NOT NULL, "cnpj" character varying(18) NOT NULL, "absorbFee" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7f16886d1a44ed0974232b82506" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ce9d22a254553d73e4640dbc14" ON "producers" ("cnpj") `);
        await queryRunner.query(`CREATE TABLE "sectors" ("id" character varying(32) NOT NULL, "eventId" character varying(32) NOT NULL, "name" character varying(80) NOT NULL, "colorHex" character varying(9) NOT NULL, "priceCents" integer NOT NULL, "capacity" integer NOT NULL, "sold" integer NOT NULL DEFAULT '0', "reserved" integer NOT NULL DEFAULT '0', "sortOrder" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_923fdda0dc12f59add7b3a1782f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."events_category_enum" AS ENUM('SHOW', 'FESTIVAL', 'BALADA', 'INFANTIL', 'TEATRO')`);
        await queryRunner.query(`CREATE TYPE "public"."events_status_enum" AS ENUM('DRAFT', 'PUBLISHED', 'CANCELLED', 'SOLD_OUT')`);
        await queryRunner.query(`CREATE TABLE "events" ("id" character varying(32) NOT NULL, "slug" character varying(200) NOT NULL, "title" character varying(200) NOT NULL, "artist" character varying(200) NOT NULL, "category" "public"."events_category_enum" NOT NULL, "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "doorsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "ageRating" integer NOT NULL DEFAULT '0', "posterUrl" character varying(500) NOT NULL, "description" text NOT NULL, "venueId" character varying(32) NOT NULL, "producerId" character varying(32) NOT NULL, "status" "public"."events_status_enum" NOT NULL DEFAULT 'DRAFT', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_05bd884c03d3f424e2204bd14c" ON "events" ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_2fe9c6f2bd89ce5a23b22746f7" ON "events" ("startsAt", "status") `);
        await queryRunner.query(`CREATE TABLE "venues" ("id" character varying(32) NOT NULL, "name" character varying(160) NOT NULL, "city" character varying(120) NOT NULL, "state" character varying(2) NOT NULL, "capacity" integer NOT NULL, "seatMap" jsonb, CONSTRAINT "PK_cb0f885278d12384eb7a81818be" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tickets_status_enum" AS ENUM('VALID', 'USED', 'REFUNDED', 'TRANSFERRED')`);
        await queryRunner.query(`CREATE TABLE "tickets" ("id" character varying(32) NOT NULL, "shortCode" character varying(40) NOT NULL, "orderId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "eventId" character varying(32) NOT NULL, "sectorId" character varying(32) NOT NULL, "qrToken" text NOT NULL, "status" "public"."tickets_status_enum" NOT NULL DEFAULT 'VALID', "usedAt" TIMESTAMP WITH TIME ZONE, "transferredToUserId" character varying(32), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_343bc942ae261cf7a1377f48fd0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1a7396e274fd9456356795cf56" ON "tickets" ("shortCode") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1c77cbb3c49baf2feeed3241f1" ON "tickets" ("qrToken") `);
        await queryRunner.query(`CREATE TABLE "order_items" ("id" character varying(32) NOT NULL, "orderId" character varying(32) NOT NULL, "sectorId" character varying(32) NOT NULL, "qty" integer NOT NULL, "priceCents" integer NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED', 'REFUNDED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TYPE "public"."orders_paymentmethod_enum" AS ENUM('PIX', 'CARD', 'BOLETO')`);
        await queryRunner.query(`CREATE TABLE "orders" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING', "subtotalCents" integer NOT NULL, "feeCents" integer NOT NULL, "discountCents" integer NOT NULL DEFAULT '0', "totalCents" integer NOT NULL, "paymentMethod" "public"."orders_paymentmethod_enum", "paymentId" character varying(200), "reservedUntil" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "paidAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('BUYER', 'PRODUCER', 'STAFF', 'ADMIN')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" character varying(32) NOT NULL, "email" character varying(160) NOT NULL, "cpf" character varying(14) NOT NULL, "name" character varying(160) NOT NULL, "phone" character varying(32) NOT NULL, "passwordHash" character varying(200), "role" "public"."users_role_enum" NOT NULL DEFAULT 'BUYER', "referralCode" character varying(32) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_230b925048540454c8b4c481e1" ON "users" ("cpf") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b7f8278f4e89249bb75c9a1589" ON "users" ("referralCode") `);
        await queryRunner.query(`CREATE TYPE "public"."referrals_status_enum" AS ENUM('PENDING', 'CREDITED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TABLE "referrals" ("id" character varying(32) NOT NULL, "code" character varying(32) NOT NULL, "referrerId" character varying(32) NOT NULL, "referredId" character varying(32), "rewardCents" integer NOT NULL DEFAULT '2000', "status" "public"."referrals_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ea9980e34f738b6252817326c08" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a53a83849f95cbcf3fbcf32fd0" ON "referrals" ("code") `);
        await queryRunner.query(`ALTER TABLE "sectors" ADD CONSTRAINT "FK_348fb4b7a8f4dd2f338b4566c81" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_0af7bb0535bc01f3c130cfe5fe7" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_fc86f4e96272d946625307cafd0" FOREIGN KEY ("producerId") REFERENCES "producers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tickets" ADD CONSTRAINT "FK_e3e1e1e9d4ee34649da54a016e4" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tickets" ADD CONSTRAINT "FK_4bb45e096f521845765f657f5c8" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_cfa205c8935ae3d99a94fc74c8c" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_cfa205c8935ae3d99a94fc74c8c"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d"`);
        await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "FK_4bb45e096f521845765f657f5c8"`);
        await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "FK_e3e1e1e9d4ee34649da54a016e4"`);
        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_fc86f4e96272d946625307cafd0"`);
        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_0af7bb0535bc01f3c130cfe5fe7"`);
        await queryRunner.query(`ALTER TABLE "sectors" DROP CONSTRAINT "FK_348fb4b7a8f4dd2f338b4566c81"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a53a83849f95cbcf3fbcf32fd0"`);
        await queryRunner.query(`DROP TABLE "referrals"`);
        await queryRunner.query(`DROP TYPE "public"."referrals_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b7f8278f4e89249bb75c9a1589"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_230b925048540454c8b4c481e1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP TYPE "public"."orders_paymentmethod_enum"`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
        await queryRunner.query(`DROP TABLE "order_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1c77cbb3c49baf2feeed3241f1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1a7396e274fd9456356795cf56"`);
        await queryRunner.query(`DROP TABLE "tickets"`);
        await queryRunner.query(`DROP TYPE "public"."tickets_status_enum"`);
        await queryRunner.query(`DROP TABLE "venues"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2fe9c6f2bd89ce5a23b22746f7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_05bd884c03d3f424e2204bd14c"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`DROP TYPE "public"."events_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."events_category_enum"`);
        await queryRunner.query(`DROP TABLE "sectors"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ce9d22a254553d73e4640dbc14"`);
        await queryRunner.query(`DROP TABLE "producers"`);
    }

}
