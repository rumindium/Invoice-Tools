import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One template-builder template per document type and workspace. Designs beyond that (from before
 * the limit) are archived, not deleted: the one in use as a document template is kept, otherwise
 * the most recently edited. Archived designs stay readable for documents that point at them.
 */
export class TemplateDesignQuota1764600000000 implements MigrationInterface {
  name = 'TemplateDesignQuota1764600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "template_designs" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ(6) NULL`,
    );
    await queryRunner.query(`
      WITH ranked AS (
        SELECT design.id,
               ROW_NUMBER() OVER (
                 PARTITION BY design.workspace_id, design.kind
                 ORDER BY
                   EXISTS (
                     SELECT 1 FROM "document_templates" template
                     WHERE template.design_id = design.id
                       AND template.is_default
                       AND template.archived_at IS NULL
                   ) DESC,
                   design.updated_at DESC
               ) AS position
        FROM "template_designs" design
        WHERE design.archived_at IS NULL
      )
      UPDATE "template_designs"
      SET "archived_at" = CURRENT_TIMESTAMP
      WHERE id IN (SELECT id FROM ranked WHERE position > 1)
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "template_designs_one_per_kind_key" ON "template_designs" ("workspace_id", "kind") WHERE "archived_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "template_designs_one_per_kind_key"`);
    await queryRunner.query(`ALTER TABLE "template_designs" DROP COLUMN IF EXISTS "archived_at"`);
  }
}
