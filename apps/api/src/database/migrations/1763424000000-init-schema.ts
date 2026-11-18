import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline migration for a fresh database. The DDL matches the running schema, so an
 * existing database can be marked as migrated instead of running it again.
 */
export class InitSchema1763424000000 implements MigrationInterface {
  name = 'InitSchema1763424000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(join(__dirname, '..', 'schema', '0001-init.sql'), 'utf8');
    await queryRunner.query(sql);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP SCHEMA IF EXISTS "public" CASCADE');
    await queryRunner.query('CREATE SCHEMA "public"');
  }
}
