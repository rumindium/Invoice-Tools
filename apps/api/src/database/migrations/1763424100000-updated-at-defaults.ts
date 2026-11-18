import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
  'workspaces',
  'companies',
  'customers',
  'catalog_items',
  'document_number_sequences',
  'document_templates',
  'documents',
];

/**
 * Prisma always wrote `updated_at` from the application, so the columns had no
 * database default. TypeORM relies on the default when it inserts a row, so give
 * every one of those columns one.
 */
export class UpdatedAtDefaults1763424100000 implements MigrationInterface {
  name = 'UpdatedAtDefaults1763424100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "updated_at" SET DEFAULT now()`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "updated_at" DROP DEFAULT`);
    }
  }
}
