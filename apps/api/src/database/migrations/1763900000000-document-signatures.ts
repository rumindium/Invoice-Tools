import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-document signature block (quotations): who signs, their title, and an optional drawn or
 * uploaded signature image stored as a PNG/JPEG data URL. Empty for documents without one.
 */
export class DocumentSignatures1763900000000 implements MigrationInterface {
  name = 'DocumentSignatures1763900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documents"
        ADD COLUMN IF NOT EXISTS "signature_name" TEXT NULL,
        ADD COLUMN IF NOT EXISTS "signature_title" TEXT NULL,
        ADD COLUMN IF NOT EXISTS "signature_image" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documents"
        DROP COLUMN IF EXISTS "signature_image",
        DROP COLUMN IF EXISTS "signature_title",
        DROP COLUMN IF EXISTS "signature_name"
    `);
  }
}
