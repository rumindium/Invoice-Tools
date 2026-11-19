import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * User-facing version of a document (1 = original). Revising a sent quotation, received
 * goods receipt or issued invoice archives the current version in document_revisions
 * (snapshot, checksum, reason) and bumps this number; `version` stays the row counter.
 */
export class DocumentRevisionNumbers1764100000000 implements MigrationInterface {
  name = 'DocumentRevisionNumbers1764100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "revision"`);
  }
}
