import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Template builder designs and their asset library (uploads, signatures), per workspace. A company
 * can make a design its active template for a document type: `document_templates.layout = 'custom'`
 * with `design_id` set. Documents keep a copy of the design in `template_snapshot`, so deleting a
 * design never changes issued documents.
 */
export class TemplateDesigns1764500000000 implements MigrationInterface {
  name = 'TemplateDesigns1764500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_designs" (
        "id" TEXT NOT NULL,
        "workspace_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "kind" "DocumentType" NOT NULL,
        "accent_color" TEXT NOT NULL,
        "page" JSONB NOT NULL,
        "elements" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "revision" INTEGER NOT NULL DEFAULT 1,
        "created_by" TEXT NULL,
        "updated_by" TEXT NULL,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "template_designs_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "template_designs_revision_check" CHECK ("revision" >= 1),
        CONSTRAINT "template_designs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "template_designs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "template_designs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "template_designs_workspace_id_updated_at_idx" ON "template_designs" ("workspace_id", "updated_at" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_assets" (
        "id" TEXT NOT NULL,
        "workspace_id" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "data_url" TEXT NOT NULL,
        "byte_size" INTEGER NOT NULL,
        "created_by" TEXT NULL,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "template_assets_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "template_assets_kind_check" CHECK ("kind" IN ('upload', 'signature')),
        CONSTRAINT "template_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "template_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "template_assets_workspace_id_kind_idx" ON "template_assets" ("workspace_id", "kind", "created_at" DESC)`,
    );

    await queryRunner.query(
      `ALTER TABLE "document_templates" ADD COLUMN IF NOT EXISTS "design_id" TEXT NULL`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "template_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "document_templates_design_id_idx" ON "document_templates" ("design_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "document_templates_design_id_idx"`);
    await queryRunner.query(
      `ALTER TABLE "document_templates" DROP CONSTRAINT IF EXISTS "document_templates_design_id_fkey"`,
    );
    await queryRunner.query(`ALTER TABLE "document_templates" DROP COLUMN IF EXISTS "design_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "template_assets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "template_designs"`);
  }
}
