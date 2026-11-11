-- Generated with Prisma 6.19.3 migrate diff, then reviewed and extended.
BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('RUNNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TokenKind" AS ENUM ('REFRESH', 'PASSWORD_RESET', 'EMAIL_VERIFY');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('CAPTAIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "BadgeCriteria" AS ENUM ('TOTAL_DISTANCE', 'HEX_COUNT', 'STREAK_DAYS', 'RUN_COUNT');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('UPLOADING', 'PENDING', 'VALID', 'FLAGGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HexOutcome" AS ENUM ('CAPTURED', 'REFRESHED', 'ON_COOLDOWN', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "FlagReason" AS ENUM ('SPEED_LIMIT', 'GPS_JUMP', 'VEHICLE_PATTERN', 'MOCK_LOCATION', 'RESTRICTED_ZONE', 'USER_REPORT');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'DISMISSED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('HEX_LOST', 'RUN_VALIDATED', 'RUN_FLAGGED', 'BADGE_EARNED', 'SEASON_ENDED', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(60) NOT NULL,
    "role" "SystemRole" NOT NULL DEFAULT 'RUNNER',
    "verified_at" TIMESTAMPTZ(6),
    "deletion_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "kind" "TokenKind" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_privacy_settings" (
    "user_id" UUID NOT NULL,
    "hide_route" BOOLEAN NOT NULL DEFAULT true,
    "home_hex" BIGINT,
    "hide_radius_m" INTEGER NOT NULL DEFAULT 200,
    "consent_at" TIMESTAMPTZ(6),
    "terms_version" VARCHAR(10),

    CONSTRAINT "user_privacy_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "color_hex" VARCHAR(7) NOT NULL,
    "invite_code" VARCHAR(12) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "user_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "followee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","followee_id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "criteria" "BadgeCriteria" NOT NULL,
    "threshold" INTEGER NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "user_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "awarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("user_id","badge_id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(60) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'UPCOMING',

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_scores" (
    "season_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "hexes_held" INTEGER NOT NULL,
    "distance_m" BIGINT NOT NULL,
    "final_rank" INTEGER NOT NULL,

    CONSTRAINT "season_scores_pkey" PRIMARY KEY ("season_id","user_id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "user_id" UUID NOT NULL,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "total_dist_m" BIGINT NOT NULL DEFAULT 0,
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "last_run_on" DATE,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "client_run_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6) NOT NULL,
    "distance_m" INTEGER NOT NULL,
    "duration_s" INTEGER NOT NULL,
    "route_polyline" TEXT NOT NULL DEFAULT '',
    "h3_resolution" SMALLINT NOT NULL DEFAULT 11,
    "status" "RunStatus" NOT NULL DEFAULT 'UPLOADING',
    "mock_gps" BOOLEAN NOT NULL DEFAULT false,
    "app_version" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_points" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "run_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "accuracy_m" REAL NOT NULL,
    "speed_mps" REAL,

    CONSTRAINT "run_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "zone_id" UUID,
    "reason" "FlagReason" NOT NULL,
    "details" TEXT,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "reporter_id" UUID,
    "resolver_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "run_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hex_ownership" (
    "h3_index" BIGINT NOT NULL,
    "owner_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "claimed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldown_until" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hex_ownership_pkey" PRIMARY KEY ("h3_index")
);

-- CreateTable
CREATE TABLE "run_hexes" (
    "run_id" UUID NOT NULL,
    "h3_index" BIGINT NOT NULL,
    "outcome" "HexOutcome" NOT NULL,
    "prev_owner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_hexes_pkey" PRIMARY KEY ("run_id","h3_index")
);

-- CreateTable
CREATE TABLE "restricted_zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restricted_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restricted_zone_hexes" (
    "zone_id" UUID NOT NULL,
    "h3_index" BIGINT NOT NULL,

    CONSTRAINT "restricted_zone_hexes_pkey" PRIMARY KEY ("zone_id","h3_index")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_cells" (
    "region_id" UUID NOT NULL,
    "parent_h3" BIGINT NOT NULL,

    CONSTRAINT "region_cells_pkey" PRIMARY KEY ("region_id","parent_h3")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "fcm_token" VARCHAR(255) NOT NULL,
    "platform" VARCHAR(10) NOT NULL DEFAULT 'ANDROID',
    "app_version" VARCHAR(20) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "body" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_settings" (
    "key" VARCHAR(50) NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "game_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "app_releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_code" INTEGER NOT NULL,
    "version_name" VARCHAR(20) NOT NULL,
    "apk_url" TEXT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "changelog" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_kind_idx" ON "auth_tokens"("user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateIndex
CREATE UNIQUE INDEX "teams_invite_code_key" ON "teams"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "badges_code_key" ON "badges"("code");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_name_key" ON "seasons"("name");

-- CreateIndex
CREATE INDEX "runs_user_id_started_at_idx" ON "runs"("user_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "runs_user_id_client_run_id_key" ON "runs"("user_id", "client_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "run_points_run_id_seq_key" ON "run_points"("run_id", "seq");

-- CreateIndex
CREATE INDEX "run_flags_status_created_at_idx" ON "run_flags"("status", "created_at");

-- CreateIndex
CREATE INDEX "hex_ownership_owner_id_claimed_at_idx" ON "hex_ownership"("owner_id", "claimed_at");

-- CreateIndex
CREATE INDEX "run_hexes_h3_index_idx" ON "run_hexes"("h3_index");

-- CreateIndex
CREATE UNIQUE INDEX "restricted_zones_name_key" ON "restricted_zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "devices_fcm_token_key" ON "devices"("fcm_token");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "login_attempts_email_created_at_idx" ON "login_attempts"("email", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_releases_version_code_key" ON "app_releases"("version_code");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_privacy_settings" ADD CONSTRAINT "user_privacy_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "season_scores" ADD CONSTRAINT "season_scores_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "season_scores" ADD CONSTRAINT "season_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "run_points" ADD CONSTRAINT "run_points_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "run_flags" ADD CONSTRAINT "run_flags_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "run_flags" ADD CONSTRAINT "run_flags_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "restricted_zones"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "run_flags" ADD CONSTRAINT "run_flags_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "run_flags" ADD CONSTRAINT "run_flags_resolver_id_fkey" FOREIGN KEY ("resolver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hex_ownership" ADD CONSTRAINT "hex_ownership_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hex_ownership" ADD CONSTRAINT "hex_ownership_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "run_hexes" ADD CONSTRAINT "run_hexes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "restricted_zone_hexes" ADD CONSTRAINT "restricted_zone_hexes_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "restricted_zones"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "region_cells" ADD CONSTRAINT "region_cells_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- Hand-written PostgreSQL rules: Prisma 6 cannot represent these constraints,
-- partial indexes, identity syntax or audit trigger. Keep this section in sync
-- with the written spec and preserve it when generating later migrations.
-- BIGSERIAL above was replaced with GENERATED BY DEFAULT AS IDENTITY for
-- run_points.id and login_attempts.id (Prisma models use autoincrement()).

ALTER TABLE "users"
    ADD CONSTRAINT "users_email_lowercase_check" CHECK (email = lower(email));

ALTER TABLE "follows"
    ADD CONSTRAINT "follows_no_self_follow_check" CHECK (follower_id <> followee_id);

ALTER TABLE "badges"
    ADD CONSTRAINT "badges_threshold_positive_check" CHECK (threshold > 0);

ALTER TABLE "seasons"
    ADD CONSTRAINT "seasons_time_order_check" CHECK (ends_at > starts_at);

ALTER TABLE "runs"
    ADD CONSTRAINT "runs_time_order_check" CHECK (ended_at > started_at),
    ADD CONSTRAINT "runs_distance_nonnegative_check" CHECK (distance_m >= 0),
    ADD CONSTRAINT "runs_duration_positive_check" CHECK (duration_s > 0);

ALTER TABLE "run_flags"
    ADD CONSTRAINT "run_flags_reporter_reason_check"
    CHECK (reporter_id IS NULL OR reason = 'USER_REPORT');

CREATE UNIQUE INDEX "team_members_one_captain_per_team_idx"
    ON "team_members" (team_id) WHERE role = 'CAPTAIN';

CREATE UNIQUE INDEX "seasons_one_active_idx"
    ON "seasons" (status) WHERE status = 'ACTIVE';

-- Append-only audit history must survive the admin and resist mutation.
-- A statement trigger also rejects TRUNCATE, including when no rows exist.
CREATE FUNCTION reject_admin_actions_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'admin_actions is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER admin_actions_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON "admin_actions"
    FOR EACH STATEMENT EXECUTE FUNCTION reject_admin_actions_mutation();

COMMIT;
