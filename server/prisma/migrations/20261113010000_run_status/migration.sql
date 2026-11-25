-- Proposed migration 1: enum additions only. No BEGIN/COMMIT wrapper.
-- Complete this migration before the following migration uses these values.
ALTER TYPE "RunStatus" ADD VALUE 'ACTIVE';
ALTER TYPE "RunStatus" ADD VALUE 'PENDING_VALIDATION';
