-- ============================================================================
-- Supabase Migration: Multi-Model LLM Providers
-- ============================================================================
-- Migrates llm_providers.model_name (single TEXT) → available_models (TEXT[])
--
-- This script is SAFE to run multiple times (idempotent).
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- Step 1: Add available_models column (if it doesn't exist yet)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'llm_providers' AND column_name = 'available_models'
    ) THEN
        ALTER TABLE llm_providers ADD COLUMN available_models TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added available_models column to llm_providers';
    ELSE
        RAISE NOTICE 'available_models column already exists — skipping';
    END IF;
END $$;

-- Step 2: Copy existing model_name values into available_models
-- Only runs if model_name column still exists (hasn't been migrated yet)
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'llm_providers' AND column_name = 'model_name'
    ) THEN
        -- Copy non-null model names into the array (only if array is still empty)
        UPDATE llm_providers
        SET available_models = ARRAY[model_name]
        WHERE model_name IS NOT NULL
          AND (available_models IS NULL OR available_models = '{}');

        RAISE NOTICE 'Migrated model_name values into available_models';
    ELSE
        RAISE NOTICE 'model_name column already removed — nothing to migrate';
    END IF;
END $$;

-- Step 3: Drop the old model_name column
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'llm_providers' AND column_name = 'model_name'
    ) THEN
        ALTER TABLE llm_providers DROP COLUMN model_name;
        RAISE NOTICE 'Dropped model_name column from llm_providers';
    ELSE
        RAISE NOTICE 'model_name column already gone — skipping';
    END IF;
END $$;

-- Step 4: Verify the migration
DO $$
DECLARE
    provider_count INTEGER;
    models_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO provider_count FROM llm_providers;
    SELECT COUNT(*) INTO models_count FROM llm_providers WHERE array_length(available_models, 1) > 0;

    RAISE NOTICE '--- Migration Summary ---';
    RAISE NOTICE 'Total providers: %', provider_count;
    RAISE NOTICE 'Providers with models: %', models_count;

    -- Verify model_name column is gone
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'llm_providers' AND column_name = 'model_name'
    ) THEN
        RAISE WARNING 'model_name column still exists — migration may have failed!';
    ELSE
        RAISE NOTICE 'model_name column successfully removed';
    END IF;

    -- Verify available_models column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'llm_providers' AND column_name = 'available_models'
    ) THEN
        RAISE NOTICE 'available_models column present';
    ELSE
        RAISE WARNING 'available_models column missing — migration may have failed!';
    END IF;

    RAISE NOTICE '--- Done ---';
END $$;

-- ============================================================================
-- What this does:
--   1. Adds available_models TEXT[] column to llm_providers
--   2. Copies each provider's model_name into available_models as a 1-element array
--   3. Drops the old model_name column
--   4. Prints a verification summary
--
-- What this does NOT touch:
--   - discussion_participants.model_name (stays as-is, per-participant free text)
--   - RLS policies (none reference model_name)
--   - Any other tables
--
-- Safe to run multiple times — each step checks before acting.
-- ============================================================================
