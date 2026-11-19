import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customer feedback log: who said what, through which channel (email, phone, WhatsApp, …),
 * when, how it was rated, and how it was resolved. Rows go with their workspace; the
 * customer and related document links are cleared if those are deleted.
 */
export class CustomerFeedback1764200000000 implements MigrationInterface {
  name = 'CustomerFeedback1764200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_feedback" (
        "id" TEXT NOT NULL,
        "workspace_id" TEXT NOT NULL,
        "customer_id" TEXT NULL,
        "customer_name" TEXT NOT NULL,
        "contact_name" TEXT NULL,
        "source" TEXT NOT NULL,
        "source_detail" TEXT NULL,
        "category" TEXT NOT NULL,
        "rating" SMALLINT NULL,
        "subject" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "received_on" DATE NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'NEW',
        "resolution" TEXT NULL,
        "resolved_at" TIMESTAMPTZ(6) NULL,
        "related_document_id" TEXT NULL,
        "evidence" TEXT NULL,
        "created_by" TEXT NULL,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "customer_feedback_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "customer_feedback_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
        CONSTRAINT "customer_feedback_source_check" CHECK ("source" IN ('EMAIL', 'PHONE', 'WHATSAPP', 'MEETING', 'SOCIAL_MEDIA', 'WEBSITE', 'SURVEY', 'OTHER')),
        CONSTRAINT "customer_feedback_category_check" CHECK ("category" IN ('COMPLIMENT', 'COMPLAINT', 'SUGGESTION', 'QUESTION', 'OTHER')),
        CONSTRAINT "customer_feedback_status_check" CHECK ("status" IN ('NEW', 'IN_PROGRESS', 'RESOLVED')),
        CONSTRAINT "customer_feedback_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "customer_feedback_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "customer_feedback_related_document_id_fkey" FOREIGN KEY ("related_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "customer_feedback_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "customer_feedback_workspace_id_received_on_idx" ON "customer_feedback" ("workspace_id", "received_on" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "customer_feedback_customer_id_idx" ON "customer_feedback" ("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_feedback"`);
  }
}
