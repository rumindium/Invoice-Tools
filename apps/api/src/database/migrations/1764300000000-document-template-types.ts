import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Document templates per document type. A company keeps one row per (document type, layout)
 * with its own accent colour, and exactly one active (`is_default`) row per document type;
 * documents point at the row they were generated with (`documents.template_id`) and keep a
 * copy of the layout and colour in `template_snapshot`.
 */
export class DocumentTemplateTypes1764300000000 implements MigrationInterface {
  name = 'DocumentTemplateTypes1764300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_templates" ADD COLUMN IF NOT EXISTS "document_type" "DocumentType" NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "document_templates_company_id_document_type_idx" ON "document_templates" ("company_id", "document_type")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "document_templates_one_active_per_type_key" ON "document_templates" ("company_id", "document_type") WHERE "is_default" AND "archived_at" IS NULL AND "document_type" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "document_templates_one_active_per_type_key"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "document_templates_company_id_document_type_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_templates" DROP COLUMN IF EXISTS "document_type"`,
    );
  }
}
