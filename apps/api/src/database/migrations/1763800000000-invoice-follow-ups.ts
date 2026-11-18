import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Follow-ups logged from an invoice detail page: activity, method, date, feedback, status and
 * optional evidence. Rows disappear with their invoice or workspace.
 */
export class InvoiceFollowUps1763800000000 implements MigrationInterface {
  name = 'InvoiceFollowUps1763800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoice_follow_ups" (
        "id" TEXT NOT NULL,
        "workspace_id" TEXT NOT NULL,
        "document_id" TEXT NOT NULL,
        "activity" TEXT NOT NULL,
        "method" TEXT NOT NULL,
        "follow_up_date" DATE NOT NULL,
        "feedback" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "evidence" TEXT NULL,
        "created_by" TEXT NULL,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "invoice_follow_ups_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "invoice_follow_ups_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "invoice_follow_ups_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "invoice_follow_ups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "invoice_follow_ups_document_id_idx" ON "invoice_follow_ups" ("document_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "invoice_follow_ups_workspace_id_idx" ON "invoice_follow_ups" ("workspace_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invoice_follow_ups"`);
  }
}
