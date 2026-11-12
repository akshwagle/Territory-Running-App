BEGIN;

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('PASSWORD', 'GOOGLE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspended_at" TIMESTAMPTZ(6),
ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "auth_tokens" ADD COLUMN     "family_id" UUID,
ADD COLUMN     "grace_replayed_at" TIMESTAMPTZ(6),
ADD COLUMN     "ip_hash" VARCHAR(64),
ADD COLUMN     "replaced_by_id" UUID,
ADD COLUMN     "revoked_at" TIMESTAMPTZ(6),
ADD COLUMN     "user_agent" TEXT;

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_subject" VARCHAR(255) NOT NULL,
    "email_at_signup" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_subject_key" ON "auth_identities"("provider", "provider_subject");

-- CreateIndex
CREATE INDEX "auth_tokens_family_id_idx" ON "auth_tokens"("family_id");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "auth_tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Hand-written PostgreSQL rules: preserve the original migration unchanged.
-- Prisma cannot represent this expression index or the CHECK constraints.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));

-- Give every existing password account its corresponding identity.
-- Preserve password hashes; legacy bcrypt hashes can be upgraded on login.
INSERT INTO "auth_identities"
    ("user_id", "provider", "provider_subject", "email_at_signup")
SELECT "id", 'PASSWORD'::"AuthProvider", lower("email"), "email"
FROM "users"
WHERE "password_hash" IS NOT NULL;

-- Legacy refresh rows have no rotation history: invalidate them, preserving
-- their hashes and timestamps. Password-reset/email-verification rows are untouched.
UPDATE "auth_tokens"
SET "family_id" = "id",
    "used_at" = COALESCE("used_at", CURRENT_TIMESTAMP),
    "revoked_at" = CURRENT_TIMESTAMP
WHERE "kind" = 'REFRESH';

ALTER TABLE "auth_tokens"
    ADD CONSTRAINT "auth_tokens_refresh_family_check"
        CHECK (("kind" = 'REFRESH' AND "family_id" IS NOT NULL)
            OR ("kind" <> 'REFRESH' AND "family_id" IS NULL)),
    ADD CONSTRAINT "auth_tokens_rotation_state_check"
        CHECK ("replaced_by_id" IS NULL
            OR ("kind" = 'REFRESH' AND "used_at" IS NOT NULL
                AND "replaced_by_id" <> "id")),
    ADD CONSTRAINT "auth_tokens_grace_state_check"
        CHECK ("grace_replayed_at" IS NULL
            OR ("kind" = 'REFRESH' AND "replaced_by_id" IS NOT NULL
                AND "used_at" IS NOT NULL));

COMMIT;
