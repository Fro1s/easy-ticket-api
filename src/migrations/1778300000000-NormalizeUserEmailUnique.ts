import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normaliza e-mails de usuários para minúsculo e impõe unicidade
 * case-insensitive. Antes, o índice único era case-sensitive, permitindo que
 * "Laisd1465@gmail.com" e "laisd1465@gmail.com" virassem dois usuários — origem
 * do vazamento de escopo entre produtores.
 *
 * Pré-condição: NÃO podem existir e-mails duplicados (case-insensitive). O
 * merge de linhas duplicadas (mover orders/tickets) é uma operação de dados
 * separada e revisada — esta migration aborta com mensagem clara se restarem
 * duplicatas, em vez de mesclar dados às cegas.
 */
export class NormalizeUserEmailUnique1778300000000 implements MigrationInterface {
  name = 'NormalizeUserEmailUnique1778300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dups: Array<{ lemail: string; n: string }> = await queryRunner.query(`
      SELECT LOWER(email) AS lemail, COUNT(*) AS n
      FROM "users"
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
    `);
    if (dups.length > 0) {
      const list = dups.map((d) => `${d.lemail} (x${d.n})`).join(', ');
      throw new Error(
        `Cannot enforce case-insensitive email uniqueness: duplicate emails ` +
          `still exist: ${list}. Resolve duplicates (merge users) before running ` +
          `this migration.`,
      );
    }

    // Canonicaliza os existentes para minúsculo.
    await queryRunner.query(`UPDATE "users" SET email = LOWER(email)`);

    // Substitui o índice único case-sensitive por um sobre LOWER(email).
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_lower" ON "users" (LOWER(email))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_lower"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")`,
    );
  }
}
