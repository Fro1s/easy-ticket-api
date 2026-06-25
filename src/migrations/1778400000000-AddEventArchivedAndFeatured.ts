import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona o status ARCHIVED ("desativado": some do site, painel mantém) e a
 * coluna featuredAt (destaque na home; null = não destacado).
 *
 * Nota: remover um valor de enum no Postgres é custoso/arriscado, então o
 * down() apenas dropa a coluna featuredAt e deixa o valor ARCHIVED no enum.
 */
export class AddEventArchivedAndFeatured1778400000000 implements MigrationInterface {
  name = 'AddEventArchivedAndFeatured1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."events_status_enum" ADD VALUE IF NOT EXISTS 'ARCHIVED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "featuredAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "featuredAt"`,
    );
  }
}
