-- Migration: Add discussion_participants table and per-participant model configs
-- Run this in your Supabase SQL editor

-- 1. Create discussion_participants table
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

-- 2. Create index
CREATE INDEX IF NOT EXISTS idx_discussion_participants_discussion
    ON discussion_participants(discussion_id);

-- 3. Migrate model_name → available_models in providers
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'llm_providers' AND column_name = 'model_name') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'llm_providers' AND column_name = 'available_models') THEN
            ALTER TABLE llm_providers ADD COLUMN available_models TEXT[] DEFAULT '{}';
        END IF;
        UPDATE llm_providers SET available_models = ARRAY[model_name] WHERE model_name IS NOT NULL AND available_models = '{}';
        ALTER TABLE llm_providers DROP COLUMN model_name;
    END IF;
END $$;

-- 4. Add comment to agents table
COMMENT ON TABLE agents IS 'Agent templates - reusable participant configurations';

-- 5. Migrate existing discussion_agents to discussion_participants
INSERT INTO discussion_participants (
    discussion_id, name, system_prompt, provider_id, model_name,
    temperature, max_tokens, avatar_color, avatar_emoji, role, order_index
)
SELECT
    da.discussion_id,
    a.name,
    a.system_prompt,
    COALESCE(
        a.llm_provider_id,
        (SELECT id FROM llm_providers
         WHERE user_id = (SELECT user_id FROM discussions WHERE id = da.discussion_id LIMIT 1)
         AND is_default = TRUE LIMIT 1)
    ),
    COALESCE(
        (SELECT available_models[1] FROM llm_providers WHERE id = a.llm_provider_id),
        (SELECT available_models[1] FROM llm_providers
         WHERE user_id = (SELECT user_id FROM discussions WHERE id = da.discussion_id LIMIT 1)
         AND is_default = TRUE LIMIT 1),
        'default-model'
    ),
    a.temperature,
    a.max_tokens,
    a.avatar_color,
    a.avatar_emoji,
    da.role,
    ROW_NUMBER() OVER (PARTITION BY da.discussion_id ORDER BY da.created_at)
FROM discussion_agents da
JOIN agents a ON da.agent_id = a.id
WHERE NOT EXISTS (
    SELECT 1 FROM discussion_participants dp
    WHERE dp.discussion_id = da.discussion_id AND dp.name = a.name
)
ON CONFLICT DO NOTHING;
