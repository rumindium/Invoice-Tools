import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Each workspace can add its own units of measure (rim, trip, batch, …) next to the
 * built-in list. Item rows keep the unit as text, so removing a unit never alters an item.
 */
export class UnitsOfMeasure1763700000000 implements MigrationInterface {
  name = 'UnitsOfMeasure1763700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "units_of_measure" (
        "id" TEXT NOT NULL,
        "workspace_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "units_of_measure_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "units_of_measure_workspace_id_idx" ON "units_of_measure" ("workspace_id")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "units_of_measure_workspace_name_key" ON "units_of_measure" ("workspace_id", lower("name"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "units_of_measure"`);
  }
}
