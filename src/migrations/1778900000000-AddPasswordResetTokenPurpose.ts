import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Novo valor PASSWORD_RESET no enum de propósito dos claim tokens, usado pelo
 * fluxo "esqueci minha senha".
 *
 * `ADD VALUE` não roda dentro de transação em Postgres < 12 e não pode ser
 * revertido: remover um label de enum exige recriar o tipo. No `down`
 * recriamos o tipo sem o valor, apagando antes os tokens que o utilizam — são
 * links de recuperação de curta duração (30 min), descartáveis por natureza.
 */
export class AddPasswordResetTokenPurpose1778900000000 implements MigrationInterface {
  name = 'AddPasswordResetTokenPurpose1778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "claim_tokens_purpose_enum" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "claim_tokens" WHERE "purpose" = 'PASSWORD_RESET'`,
    );
    await queryRunner.query(
      `ALTER TYPE "claim_tokens_purpose_enum" RENAME TO "claim_tokens_purpose_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "claim_tokens_purpose_enum" AS ENUM('CLAIM', 'MAGIC_LINK')`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_tokens" ALTER COLUMN "purpose" TYPE "claim_tokens_purpose_enum" USING "purpose"::text::"claim_tokens_purpose_enum"`,
    );
    await queryRunner.query(`DROP TYPE "claim_tokens_purpose_enum_old"`);
  }
}
