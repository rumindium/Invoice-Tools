import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Payment termins (instalments). A termin plan splits one source into several documents, each
 * carrying a percentage of it: an accepted quotation into goods receipts, a received goods
 * receipt into invoices, or an invoice typed in the generator (kept as `base_payload`) into
 * invoices. Every generated document points at its plan and termin (`documents.termin_*`);
 * at most one live document (not deleted, not cancelled or void) exists per termin.
 */
// The check compares as text: on a fresh database 'GOODS_RECEIPT' is added to "DocumentType"
// earlier in the same migration run, and a new enum value cannot be used before it is committed.
export class TerminPlans1764400000000 implements MigrationInterface {
  name = 'TerminPlans1764400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "termin_plans" (
        "id" TEXT NOT NULL,
        "workspace_id" TEXT NOT NULL,
        "company_id" TEXT NOT NULL,
        "document_type" "DocumentType" NOT NULL,
        "source_document_id" TEXT NULL,
        "base_payload" JSONB NULL,
        "created_by" TEXT NULL,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "termin_plans_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "termin_plans_document_type_check" CHECK ("document_type"::text IN ('GOODS_RECEIPT', 'INVOICE')),
        CONSTRAINT "termin_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "termin_plans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "termin_plans_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "termin_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "termin_plans_workspace_id_idx" ON "termin_plans" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "termin_plans_source_document_id_document_type_key" ON "termin_plans" ("source_document_id", "document_type") WHERE "source_document_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "termin_plan_items" (
        "id" TEXT NOT NULL,
        "plan_id" TEXT NOT NULL,
        "sequence" INTEGER NOT NULL,
        "percentage" NUMERIC(7,4) NOT NULL,
        CONSTRAINT "termin_plan_items_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "termin_plan_items_percentage_check" CHECK ("percentage" >= 0 AND "percentage" <= 100),
        CONSTRAINT "termin_plan_items_sequence_check" CHECK ("sequence" >= 1),
        CONSTRAINT "termin_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "termin_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "termin_plan_items_plan_id_sequence_key" ON "termin_plan_items" ("plan_id", "sequence")`,
    );

    await queryRunner.query(
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "termin_plan_id" TEXT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "termin_sequence" INTEGER NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "termin_percentage" NUMERIC(7,4) NULL`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "documents" ADD CONSTRAINT "documents_termin_plan_id_fkey" FOREIGN KEY ("termin_plan_id") REFERENCES "termin_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "documents_termin_plan_id_idx" ON "documents" ("termin_plan_id")`,
    );
    // One live document per termin: a cancelled, void or deleted one frees the termin again.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "documents_one_live_per_termin_key" ON "documents" ("termin_plan_id", "termin_sequence") WHERE "termin_plan_id" IS NOT NULL AND "deleted_at" IS NULL AND "status" NOT IN ('CANCELLED', 'VOID')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "documents_one_live_per_termin_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "documents_termin_plan_id_idx"`);
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_termin_plan_id_fkey"`,
    );
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "termin_percentage"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "termin_sequence"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "termin_plan_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "termin_plan_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "termin_plans"`);
  }
}
