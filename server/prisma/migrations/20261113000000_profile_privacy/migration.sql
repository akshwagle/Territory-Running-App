-- STEP 04: conditional go for disposable TEST databases only; development awaits a second go.
-- Adds 3 tables (27 -> 30), 3 enums, profile fields and privacy fields.
-- Existing tables/columns, consent_at and terms_version are retained.
-- admin_actions permits only exact redaction from an actual users DELETE trigger.
-- Fixed deleted-account tombstone: 00000000-0000-0000-0000-000000000000.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'FOLLOWERS', 'PRIVATE');
CREATE TYPE "ConsentType" AS ENUM ('LOCATION', 'TERMS', 'PRIVACY');
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE FUNCTION profile_name_key(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog, public AS $$
    SELECT lower(regexp_replace(btrim(normalize(value, NFKC)), ' +', ' ', 'g'))
$$;

LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE;
-- Fail safely if new accounts have introduced conflicts since the preflight.
-- No silent renaming, truncation or removal of existing accounts.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM users
        WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
           OR char_length(display_name) NOT BETWEEN 3 AND 24
           OR display_name <> regexp_replace(btrim(normalize(display_name, NFKC)), ' +', ' ', 'g')
    ) OR EXISTS (
        SELECT 1 FROM users GROUP BY profile_name_key(display_name) HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existing display names or reserved user ID need review before this migration.';
    END IF;
END;
$$;

ALTER TABLE "users"
    ADD COLUMN "avatar_id" SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN "avatar_color" VARCHAR(7) NOT NULL DEFAULT '#1F5A46',
    ADD COLUMN "preferred_units" VARCHAR(2) NOT NULL DEFAULT 'km',
    ADD COLUMN "bio" VARCHAR(140) NOT NULL DEFAULT '',
    ADD COLUMN "home_region_id" UUID,
    ADD CONSTRAINT "users_id_not_audit_tombstone_check" CHECK (
        id <> '00000000-0000-0000-0000-000000000000'::uuid
    ),
    ADD CONSTRAINT "users_profile_name_check" CHECK (
        char_length(display_name) BETWEEN 3 AND 24 AND
        display_name = regexp_replace(btrim(normalize(display_name, NFKC)), ' +', ' ', 'g')
    ),
    ADD CONSTRAINT "users_avatar_id_check" CHECK (avatar_id BETWEEN 0 AND 11),
    ADD CONSTRAINT "users_avatar_color_check" CHECK (
        avatar_color IN ('#1F5A46', '#B8452A', '#14392C', '#5A5F58', '#1F2421')
    ),
    ADD CONSTRAINT "users_preferred_units_check" CHECK (preferred_units IN ('km', 'mi')),
    ADD CONSTRAINT "users_home_region_id_fkey" FOREIGN KEY (home_region_id)
        REFERENCES regions(id) ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "users_display_name_key" ON "users" (profile_name_key(display_name));
CREATE INDEX "users_home_region_id_idx" ON "users" (home_region_id);

ALTER TABLE "user_privacy_settings"
    ADD COLUMN "profile_visibility" "ProfileVisibility" NOT NULL DEFAULT 'PRIVATE',
    ADD COLUMN "appear_on_leaderboards" BOOLEAN NOT NULL DEFAULT false;
-- shareRouteShapes reuses NOT hide_route; do not add a conflicting second flag.
INSERT INTO user_privacy_settings (user_id) SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE "display_name_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(60) NOT NULL,
    "name_key" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "reserved_until" TIMESTAMPTZ(6) NOT NULL DEFAULT (now() + INTERVAL '720 hours'),
    CONSTRAINT "display_name_history_pkey" PRIMARY KEY (id),
    CONSTRAINT "display_name_history_user_id_fkey" FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "display_name_history_name_check" CHECK (
        char_length(display_name) BETWEEN 3 AND 24 AND
        name_key = profile_name_key(display_name)
    ),
    CONSTRAINT "display_name_history_reservation_check" CHECK (
        reserved_until = changed_at + INTERVAL '720 hours'
    )
);
CREATE INDEX "display_name_history_name_key_reserved_until_idx"
    ON "display_name_history" (name_key, reserved_until);
CREATE INDEX "display_name_history_user_id_changed_at_idx"
    ON "display_name_history" (user_id, changed_at);
-- Name claims (signup/Google/profile) must share a transaction advisory lock on
-- profile_name_key(name), check current names and unexpired OTHER-user history,
-- then write. The time-dependent 30-day rule cannot be a partial index using now().

CREATE TABLE "user_consents" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "user_id" UUID NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "user_consents_pkey" PRIMARY KEY (id),
    CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "user_consents_version_check" CHECK (
        version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'
    )
);
CREATE INDEX "user_consents_user_id_type_id_idx" ON "user_consents" (user_id, type, id);
-- The identity orders records even when timestamps tie. Consent writes lock the
-- user row; an exact retry of the latest state returns that record, not a duplicate.
-- No historical acceptance is invented from consent_at / terms_version.

CREATE FUNCTION protect_profile_history() RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
BEGIN
    -- Account erasure may cascade history; direct edits/deletes may not rewrite it.
    IF TG_OP = 'DELETE' THEN
        IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.user_id) THEN
            RETURN OLD;
        END IF;
    END IF;
    RAISE EXCEPTION 'Profile history is append-only except account-erasure cascade.'
        USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "user_consents_append_only" BEFORE UPDATE OR DELETE ON "user_consents"
    FOR EACH ROW EXECUTE FUNCTION protect_profile_history();
CREATE TRIGGER "user_consents_no_truncate" BEFORE TRUNCATE ON "user_consents"
    FOR EACH STATEMENT EXECUTE FUNCTION protect_profile_history();
CREATE TRIGGER "display_name_history_append_only" BEFORE UPDATE OR DELETE ON "display_name_history"
    FOR EACH ROW EXECUTE FUNCTION protect_profile_history();
CREATE TRIGGER "display_name_history_no_truncate" BEFORE TRUNCATE ON "display_name_history"
    FOR EACH STATEMENT EXECUTE FUNCTION protect_profile_history();

CREATE TABLE "data_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "encryption_key" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    "completed_at" TIMESTAMPTZ(6),
    CONSTRAINT "data_exports_pkey" PRIMARY KEY (id),
    CONSTRAINT "data_exports_user_id_fkey" FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "data_exports_key_check" CHECK (octet_length(encryption_key) = 32),
    CONSTRAINT "data_exports_expiry_check" CHECK (expires_at = created_at + INTERVAL '24 hours'),
    CONSTRAINT "data_exports_completion_check" CHECK (
        (status = 'PENDING' AND completed_at IS NULL) OR
        (status IN ('READY', 'FAILED') AND completed_at IS NOT NULL AND completed_at >= created_at)
    )
);
CREATE UNIQUE INDEX "data_exports_one_active_per_user" ON "data_exports" (user_id)
    WHERE status IN ('PENDING', 'READY');
CREATE INDEX "data_exports_expires_at_idx" ON "data_exports" (expires_at);
-- AES-GCM file name derives only from export UUID; nonce/tag are in the file.
-- Keys are never exported/logged. Deleting user/export rows atomically erases
-- decryption keys; unlink still cleans files, including startup/hourly retries.
-- Expired READY/PENDING rows are cleaned before new requests so they cannot
-- block a replacement export. All export/delete work shares the user lock.

-- ACCOUNT-DELETION AUDIT EXCEPTION
-- No SECURITY DEFINER function or app-callable "allow audit update" switch.
-- BEFORE DELETE snapshots identifiers before identity/name-history cascades.
-- AFTER DELETE performs redaction only after the user row is actually absent.
-- A transaction-local per-user map handles multi-row DELETE without relying on
-- ordering against PostgreSQL's internal FK cascade triggers. It is not a table.

CREATE FUNCTION audit_note_mentions_account(note_text TEXT, account_context JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public AS $$
DECLARE
    normalized_note TEXT;
    identifier TEXT;
    normalized_identifier TEXT;
    scan_from INTEGER;
    found_at INTEGER;
    after_at INTEGER;
BEGIN
    IF note_text IS NULL THEN RETURN false; END IF;
    normalized_note := lower(regexp_replace(normalize(note_text, NFKC), '[[:space:]]+', ' ', 'g'));
    FOR identifier IN
        SELECT jsonb_array_elements_text(account_context -> 'identifiers')
    LOOP
        normalized_identifier := lower(regexp_replace(normalize(identifier, NFKC), '[[:space:]]+', ' ', 'g'));
        IF normalized_identifier = '' THEN CONTINUE; END IF;
        scan_from := 1;
        LOOP
            found_at := strpos(substr(normalized_note, scan_from), normalized_identifier);
            EXIT WHEN found_at = 0;
            found_at := found_at + scan_from - 1;
            after_at := found_at + char_length(normalized_identifier);
            IF (found_at = 1 OR substr(normalized_note, found_at - 1, 1) !~ '[[:alnum:]_]')
               AND (after_at > char_length(normalized_note) OR
                    substr(normalized_note, after_at, 1) !~ '[[:alnum:]_]') THEN
                RETURN true;
            END IF;
            scan_from := found_at + 1;
        END LOOP;
    END LOOP;
    RETURN false;
END;
$$;

CREATE FUNCTION account_audit_erasure_context() RETURNS JSONB
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
DECLARE
    active_id TEXT;
    pending JSONB;
    context JSONB;
BEGIN
    -- One outer users DELETE trigger plus this audit statement/row trigger.
    -- A forged SET LOCAL by itself is insufficient: ordinary DML has depth 1.
    IF pg_trigger_depth() <> 2 THEN RETURN NULL; END IF;
    active_id := nullif(current_setting('territory.audit_erasure_active', true), '');
    IF active_id IS NULL OR active_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR active_id = '00000000-0000-0000-0000-000000000000' THEN RETURN NULL; END IF;
    pending := nullif(current_setting('territory.audit_erasure_pending', true), '')::jsonb;
    context := pending -> active_id;
    IF context IS NULL OR jsonb_typeof(context) <> 'object'
       OR (context ->> 'user_id') IS DISTINCT FROM active_id
       OR (context ->> 'transaction_id') IS DISTINCT FROM pg_current_xact_id()::text
       OR jsonb_typeof(context -> 'identifiers') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
    END IF;
    -- VOLATILE is essential: the check must see this transaction's DELETE.
    IF EXISTS (SELECT 1 FROM public.users WHERE id = active_id::uuid) THEN
        RETURN NULL;
    END IF;
    RETURN context;
EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE FUNCTION capture_account_audit_erasure() RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
DECLARE
    identifiers JSONB;
    pending JSONB;
    context JSONB;
BEGIN
    IF TG_OP <> 'DELETE' OR TG_WHEN <> 'BEFORE' OR TG_LEVEL <> 'ROW'
       OR TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'users'
       OR pg_trigger_depth() <> 1 THEN
        RAISE EXCEPTION 'Invalid account-erasure trigger context.' USING ERRCODE = '55000';
    END IF;
    SELECT coalesce(jsonb_agg(identifier ORDER BY identifier), '[]'::jsonb)
    INTO identifiers
    FROM (
        SELECT DISTINCT candidate.identifier
        FROM (
            SELECT OLD.id::text AS identifier
            UNION ALL SELECT OLD.email
            UNION ALL SELECT OLD.username
            UNION ALL SELECT OLD.display_name
            UNION ALL SELECT email_at_signup FROM public.auth_identities WHERE user_id = OLD.id
            UNION ALL SELECT provider_subject FROM public.auth_identities WHERE user_id = OLD.id
            UNION ALL SELECT display_name FROM public.display_name_history WHERE user_id = OLD.id
        ) AS candidate
        WHERE candidate.identifier IS NOT NULL AND candidate.identifier <> ''
    ) AS distinct_identifiers;
    context := jsonb_build_object('user_id', OLD.id::text,
        'transaction_id', pg_current_xact_id()::text, 'identifiers', identifiers);
    pending := coalesce(nullif(current_setting('territory.audit_erasure_pending', true), '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(pending) <> 'object' THEN
        RAISE EXCEPTION 'Invalid account-erasure trigger context.' USING ERRCODE = '55000';
    END IF;
    PERFORM set_config('territory.audit_erasure_pending',
        jsonb_set(pending, ARRAY[OLD.id::text], context, true)::text, true);
    RETURN OLD;
END;
$$;

CREATE FUNCTION redact_account_audit_after_delete() RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
DECLARE
    tombstone CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
    pending JSONB;
    context JSONB;
    previous_active TEXT;
BEGIN
    IF TG_OP <> 'DELETE' OR TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW'
       OR TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'users'
       OR pg_trigger_depth() <> 1 THEN
        RAISE EXCEPTION 'Invalid account-erasure trigger context.' USING ERRCODE = '55000';
    END IF;
    pending := nullif(current_setting('territory.audit_erasure_pending', true), '')::jsonb;
    context := pending -> OLD.id::text;
    IF context IS NULL OR (context ->> 'user_id') IS DISTINCT FROM OLD.id::text
       OR (context ->> 'transaction_id') IS DISTINCT FROM pg_current_xact_id()::text
       OR EXISTS (SELECT 1 FROM public.users WHERE id = OLD.id) THEN
        RAISE EXCEPTION 'Invalid account-erasure trigger context.' USING ERRCODE = '55000';
    END IF;
    previous_active := current_setting('territory.audit_erasure_active', true);
    PERFORM set_config('territory.audit_erasure_active', OLD.id::text, true);
    UPDATE public.admin_actions AS a
    SET admin_id = CASE WHEN a.admin_id = OLD.id THEN tombstone ELSE a.admin_id END,
        target_id = CASE WHEN a.target_id = OLD.id THEN tombstone ELSE a.target_id END,
        note = NULL
    WHERE a.admin_id = OLD.id OR a.target_id = OLD.id
       OR public.audit_note_mentions_account(a.note, context);
    PERFORM set_config('territory.audit_erasure_active', coalesce(previous_active, ''), true);
    -- Remove captured aliases immediately, rather than retaining them until commit.
    -- Reread the map so any other pending user in a multi-row DELETE is preserved.
    pending := nullif(current_setting('territory.audit_erasure_pending', true), '')::jsonb;
    PERFORM set_config('territory.audit_erasure_pending', (pending - OLD.id::text)::text, true);
    RETURN OLD;
END;
$$;

-- Keep the original statement trigger and its DELETE/TRUNCATE protection.
-- UPDATE is admitted only from the account-deletion trigger stack; the new
-- row guard below then checks the complete OLD/NEW row, not only listed fields.
CREATE OR REPLACE FUNCTION reject_admin_actions_mutation() RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND TG_WHEN = 'BEFORE' AND TG_LEVEL = 'STATEMENT'
       AND TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'admin_actions'
       AND public.account_audit_erasure_context() IS NOT NULL THEN
        RETURN NULL;
    END IF;
    RAISE EXCEPTION 'admin_actions is append-only outside account-erasure redaction.'
        USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION enforce_admin_actions_redaction() RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
DECLARE
    tombstone CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
    context JSONB;
    subject_id UUID;
    expected_row public.admin_actions%ROWTYPE;
BEGIN
    IF TG_OP <> 'UPDATE' OR TG_WHEN <> 'BEFORE' OR TG_LEVEL <> 'ROW'
       OR TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'admin_actions' THEN
        RAISE EXCEPTION 'Invalid audit-redaction trigger context.' USING ERRCODE = '55000';
    END IF;
    context := public.account_audit_erasure_context();
    IF TG_OP <> 'UPDATE' OR context IS NULL THEN
        RAISE EXCEPTION 'admin_actions is append-only outside account-erasure redaction.'
            USING ERRCODE = '55000';
    END IF;
    subject_id := (context ->> 'user_id')::uuid;
    IF OLD.admin_id <> subject_id AND OLD.target_id <> subject_id
       AND NOT public.audit_note_mentions_account(OLD.note, context) THEN
        RAISE EXCEPTION 'Audit row is outside the account-erasure scope.' USING ERRCODE = '55000';
    END IF;
    expected_row := OLD;
    IF OLD.admin_id = subject_id THEN expected_row.admin_id := tombstone; END IF;
    IF OLD.target_id = subject_id THEN expected_row.target_id := tombstone; END IF;
    expected_row.note := NULL;
    IF NEW IS DISTINCT FROM expected_row THEN
        RAISE EXCEPTION 'Only exact account-erasure audit redaction is allowed.'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "admin_actions_redaction_guard" BEFORE UPDATE ON "admin_actions"
    FOR EACH ROW EXECUTE FUNCTION enforce_admin_actions_redaction();
CREATE TRIGGER "users_capture_audit_erasure" BEFORE DELETE ON "users"
    FOR EACH ROW EXECUTE FUNCTION capture_account_audit_erasure();
CREATE TRIGGER "users_redact_audit_after_delete" AFTER DELETE ON "users"
    FOR EACH ROW EXECUTE FUNCTION redact_account_audit_after_delete();

-- Retained, not dropped/recreated:
-- admin_actions_append_only BEFORE UPDATE OR DELETE OR TRUNCATE FOR EACH STATEMENT
-- executes the replaced reject_admin_actions_mutation() function above.
-- Any failed DELETE/transaction rollback also rolls back all audit redactions.

COMMIT;
