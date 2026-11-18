import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customers keep a list of people to contact (PIC): a name, a job title and a phone number.
 * The rows belong to a customer and disappear with it.
 */
export class CustomerContacts1763600000000 implements MigrationInterface {
  name = 'CustomerContacts1763600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_contacts" (
        "id" TEXT NOT NULL,
        "customer_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "job_title" TEXT,
        "phone" TEXT,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "customer_contacts_customer_id_idx" ON "customer_contacts" ("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_contacts"`);
  }
}
