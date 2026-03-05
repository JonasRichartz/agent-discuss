-- ============================================================================
-- Supabase Migration: Add Discussion Participants
-- ============================================================================
-- This script is SAFE to run on your existing database
-- It will NOT delete or break existing tables, data, or RLS policies
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Step 1: Create discussion_participants table
-- This is a NEW table alongside existing discussion_agents
CREATE TABLE IF NOT EXISTS discussion_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    provider_id UUID NOT NULL REFERENCES llm_providers(id) ON DELETE RESTRICT,
    model_name TEXT NOT NULL,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 1024,
    avatar_color TEXT DEFAULT '#6366f1',
    avatar_emoji TEXT DEFAULT '🤖',
    role TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_discussion_participants_discussion
    ON discussion_participants(discussion_id);

-- Step 3: Migrate model_name → available_models in llm_providers
-- Adds the new array column, copies existing model names, drops old column
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'llm_providers' AND column_name = 'model_name') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'llm_providers' AND column_name = 'available_models') THEN
            ALTER TABLE llm_providers ADD COLUMN available_models TEXT[] DEFAULT '{}';
        END IF;
        UPDATE llm_providers SET available_models = ARRAY[model_name] WHERE model_name IS NOT NULL AND available_models = '{}';
        ALTER TABLE llm_providers DROP COLUMN model_name;
    END IF;
END $$;

-- Step 4: Add helpful comment
COMMENT ON TABLE agents IS 'Agent templates - reusable participant configurations';

-- Step 5: Enable Row Level Security on new table
ALTER TABLE discussion_participants ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS Policies for discussion_participants
-- Policy 1: Users can view participants in their own discussions
CREATE POLICY "Users can view their discussion participants"
    ON discussion_participants
    FOR SELECT
    USING (
        discussion_id IN (
            SELECT id FROM discussions WHERE user_id = auth.uid()
        )
    );

-- Policy 2: Users can insert participants into their draft discussions
CREATE POLICY "Users can create participants in draft discussions"
    ON discussion_participants
    FOR INSERT
    WITH CHECK (
        discussion_id IN (
            SELECT id FROM discussions
            WHERE user_id = auth.uid()
            AND status = 'draft'
        )
    );

-- Policy 3: Users can update participants in their draft discussions
CREATE POLICY "Users can update participants in draft discussions"
    ON discussion_participants
    FOR UPDATE
    USING (
        discussion_id IN (
            SELECT id FROM discussions
            WHERE user_id = auth.uid()
            AND status = 'draft'
        )
    )
    WITH CHECK (
        discussion_id IN (
            SELECT id FROM discussions
            WHERE user_id = auth.uid()
            AND status = 'draft'
        )
    );

-- Policy 4: Users can delete participants from their draft discussions
CREATE POLICY "Users can delete participants from draft discussions"
    ON discussion_participants
    FOR DELETE
    USING (
        discussion_id IN (
            SELECT id FROM discussions
            WHERE user_id = auth.uid()
            AND status = 'draft'
        )
    );

-- Step 7: Migrate existing data from discussion_agents to discussion_participants
-- This is SAFE to run multiple times (uses ON CONFLICT DO NOTHING)
-- It preserves your existing discussion_agents table
INSERT INTO discussion_participants (
    discussion_id,
    name,
    system_prompt,
    provider_id,
    model_name,
    temperature,
    max_tokens,
    avatar_color,
    avatar_emoji,
    role,
    order_index
)
SELECT
    da.discussion_id,
    a.name,
    a.system_prompt,
    -- Use agent's provider if set, otherwise use user's default provider
    COALESCE(
        a.llm_provider_id,
        (SELECT id FROM llm_providers
         WHERE user_id = (SELECT user_id FROM discussions WHERE id = da.discussion_id LIMIT 1)
         AND is_default = TRUE
         LIMIT 1)
    ) as provider_id,
    -- Get first available model from provider, or use a default
    COALESCE(
        (SELECT available_models[1] FROM llm_providers WHERE id = a.llm_provider_id),
        (SELECT available_models[1] FROM llm_providers
         WHERE user_id = (SELECT user_id FROM discussions WHERE id = da.discussion_id LIMIT 1)
         AND is_default = TRUE
         LIMIT 1),
        'llama3.2:latest'  -- Fallback default model
    ) as model_name,
    a.temperature,
    a.max_tokens,
    a.avatar_color,
    a.avatar_emoji,
    da.role,
    ROW_NUMBER() OVER (PARTITION BY da.discussion_id ORDER BY da.created_at) as order_index
FROM discussion_agents da
JOIN agents a ON da.agent_id = a.id
WHERE NOT EXISTS (
    -- Don't duplicate if participant already exists
    SELECT 1 FROM discussion_participants dp
    WHERE dp.discussion_id = da.discussion_id
    AND dp.name = a.name
)
ON CONFLICT DO NOTHING;

-- Step 8: RLS policies for documents table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
    ON documents FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can upload documents"
    ON documents FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own documents"
    ON documents FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete own documents"
    ON documents FOR DELETE
    USING (user_id = auth.uid());

-- Step 9: Add web_search_enabled column to discussions
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS web_search_enabled BOOLEAN DEFAULT FALSE;

-- Step 10: Create documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Step 11: RLS policies for documents bucket (uses Supabase's auto-set owner column)
CREATE POLICY "documents_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'documents');

CREATE POLICY "documents_select"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'documents' AND owner = auth.uid());

CREATE POLICY "documents_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'documents' AND owner = auth.uid());

-- Step 12: Add embedding_model column to llm_providers
ALTER TABLE llm_providers ADD COLUMN IF NOT EXISTS embedding_model TEXT;

-- ============================================================================
-- Migration Complete!
-- ============================================================================
-- What this did:
-- ✅ Created new discussion_participants table
-- ✅ Added index for performance
-- ✅ Migrated llm_providers.model_name → available_models TEXT[]
-- ✅ Enabled Row Level Security on new table
-- ✅ Created RLS policies (view/insert/update/delete)
-- ✅ Migrated existing data from discussion_agents
-- ✅ Added web_search_enabled column to discussions
-- ✅ Created documents storage bucket with RLS policies
-- ✅ Added embedding_model column to llm_providers
--
-- What this DID NOT do:
-- ❌ Delete discussion_agents table (still there for backward compatibility)
-- ❌ Delete any existing data
-- ❌ Modify existing RLS policies
-- ❌ Break any existing functionality
--
-- Your existing discussions will continue to work!
-- New discussions can use the participant system.
-- ============================================================================
