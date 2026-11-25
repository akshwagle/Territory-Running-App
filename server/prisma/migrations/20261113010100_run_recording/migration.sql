-- Proposed migration 2. Review only: not yet applied to any database.
BEGIN;

ALTER TABLE runs
    ALTER COLUMN ended_at DROP NOT NULL,
    ALTER COLUMN duration_s DROP NOT NULL,
    ADD COLUMN run_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN deleted_at TIMESTAMPTZ(6);

-- Keep runs_time_order_check (ended_at > started_at),
-- runs_duration_positive_check (duration_s > 0), and
-- runs_distance_nonnegative_check (distance_m >= 0) unchanged.
-- This extra CHECK permits NULL end/duration only while a run is ACTIVE.
ALTER TABLE runs
    ADD CONSTRAINT runs_recording_state_check CHECK (
        (status = 'ACTIVE' AND ended_at IS NULL AND duration_s IS NULL)
        OR
        (status <> 'ACTIVE' AND ended_at IS NOT NULL AND duration_s IS NOT NULL)
    ),
    ADD CONSTRAINT runs_max_length_check CHECK (
        ended_at IS NULL OR ended_at <= started_at + INTERVAL '24 hours'
    ),
    ADD CONSTRAINT runs_signals_object_check CHECK (
        jsonb_typeof(run_signals) = 'object'
    );

-- Paused runs keep ACTIVE status; segments in run_signals represent pauses.
-- A soft-deleted recording no longer reserves the user's active-run slot.
CREATE UNIQUE INDEX runs_one_active_user_key
    ON runs (user_id)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;

ALTER TABLE run_points
    ADD COLUMN provider VARCHAR(16) NOT NULL DEFAULT 'unknown',
    ADD COLUMN is_mock BOOLEAN,
    ADD CONSTRAINT run_points_provider_check CHECK (
        provider IN ('gps', 'network', 'fused', 'passive', 'unknown')
    ),
    ADD CONSTRAINT run_points_seq_nonnegative_check CHECK (seq >= 0),
    ADD CONSTRAINT run_points_coordinates_check CHECK (
        lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
        AND (lat <> 0 OR lng <> 0)
    ),
    ADD CONSTRAINT run_points_accuracy_check CHECK (
        accuracy_m >= 0 AND accuracy_m < 'Infinity'::real
    ),
    ADD CONSTRAINT run_points_speed_check CHECK (
        speed_mps IS NULL
        OR (speed_mps >= 0 AND speed_mps < 'Infinity'::real)
    );

COMMIT;
