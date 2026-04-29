import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterPixKeyLength1777520000000 implements MigrationInterface {
  name = 'AlterPixKeyLength1777520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ALTER COLUMN "pixKey" TYPE character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ALTER COLUMN "pixKey" TYPE character varying(140)`,
    );
  }
}
