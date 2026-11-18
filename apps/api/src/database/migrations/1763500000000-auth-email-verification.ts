import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email verification and password reset both need a single-use, hashed token.
 * Accounts that existed before this migration are treated as already verified so
 * they keep signing in; the flow only gates new registrations.
 */
export class AuthEmailVerification1763500000000 implements MigrationInterface {
  name = 'AuthEmailVerification1763500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMPTZ(6)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auth_tokens" (
        "id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "token_hash" BYTEA NOT NULL,
        "expires_at" TIMESTAMPTZ(6) NOT NULL,
        "used_at" TIMESTAMPTZ(6),
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "auth_tokens_token_hash_key" UNIQUE ("token_hash"),
        CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "auth_tokens_user_id_kind_idx" ON "auth_tokens" ("user_id", "kind")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "auth_tokens_expires_at_idx" ON "auth_tokens" ("expires_at")`,
    );

    await queryRunner.query(
      `UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_tokens"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified_at"`);
  }
}
