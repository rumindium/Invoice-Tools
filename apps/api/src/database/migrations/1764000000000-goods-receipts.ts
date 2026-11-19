import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Goods receipts (GRN) generated from accepted quotations:
 * - a GOODS_RECEIPT document type and a RECEIVED status;
 * - per-line ordered / rejected quantities and remarks (the line quantity is the received one);
 * - `receipt_details`: delivery note, carrier, vehicle, location, sign-off names and the
 *   source quotation snapshot.
 * The quotation → receipt link itself is a CONVERTED_TO row in document_relations.
 */
export class GoodsReceipts1764000000000 implements MigrationInterface {
  name = 'GoodsReceipts1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'GOODS_RECEIPT'`);
    await queryRunner.query(`ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'RECEIVED'`);
    await queryRunner.query(`
      ALTER TABLE "document_items"
        ADD COLUMN IF NOT EXISTS "ordered_quantity" NUMERIC(18, 4) NULL,
        ADD COLUMN IF NOT EXISTS "rejected_quantity" NUMERIC(18, 4) NULL,
        ADD COLUMN IF NOT EXISTS "remarks" TEXT NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "receipt_details" JSONB NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot drop enum values; remove the documents that use them instead.
    await queryRunner.query(
      `DELETE FROM "documents" WHERE "document_type"::text = 'GOODS_RECEIPT'`,
    );
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "receipt_details"`);
    await queryRunner.query(`
      ALTER TABLE "document_items"
        DROP COLUMN IF EXISTS "remarks",
        DROP COLUMN IF EXISTS "rejected_quantity",
        DROP COLUMN IF EXISTS "ordered_quantity"
    `);
  }
}
