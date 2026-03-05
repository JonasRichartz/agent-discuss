-- Initialize database schema for local development
-- This file is executed when the PostgreSQL container starts

-- Note: For production, use Supabase dashboard or migrations
-- This schema mirrors what should be in Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (simplified for local dev - in Supabase this references auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name TEXT,
    avatar_url TEXT,
    preferences JSONB DEFAULT '{"theme": "dark"}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LLM Providers
CREATE TABLE IF NOT EXISTS llm_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT,
    available_models TEXT[] DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    embedding_model TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    llm_provider_id UUID REFERENCES llm_providers(id) ON DELETE SET NULL,
    model_name TEXT,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 1024,
    avatar_color TEXT DEFAULT '#6366f1',
    avatar_emoji TEXT DEFAULT '🤖',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Graph Templates
CREATE TABLE IF NOT EXISTS graph_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    graph_definition JSONB NOT NULL,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discussion status enum
DO $$ BEGIN
    CREATE TYPE discussion_status AS ENUM (
        'draft',
        'running',
        'paused',
        'completed',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Discussions
CREATE TABLE IF NOT EXISTS discussions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    description TEXT,
    status discussion_status DEFAULT 'draft',
    graph_definition JSONB NOT NULL,
    execution_state JSONB DEFAULT '{}'::jsonb,
    context_summary TEXT,
    web_search_enabled BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: Add web_search_enabled column if it doesn't exist
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'discussions' AND column_name = 'web_search_enabled'
    ) THEN
        ALTER TABLE discussions ADD COLUMN web_search_enabled BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Discussion Agents (many-to-many)
CREATE TABLE IF NOT EXISTS discussion_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role TEXT,
    agent_context TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(discussion_id, agent_id)
);

-- Message type enum
DO $$ BEGIN
    CREATE TYPE message_type AS ENUM (
        'agent_message',
        'system_message',
        'node_transition',
        'summary',
        'error'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    message_type message_type NOT NULL DEFAULT 'agent_message',
    content TEXT NOT NULL,
    graph_node_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_discussion_sequence
    ON messages(discussion_id, sequence_number);

-- Document status enum
DO $$ BEGIN
    CREATE TYPE document_status AS ENUM (
        'uploading',
        'processing',
        'ready',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Documents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    status document_status DEFAULT 'uploading',
    chunk_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discussion Documents (many-to-many)
CREATE TABLE IF NOT EXISTS discussion_documents (
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (discussion_id, document_id)
);

-- Insert default system templates
INSERT INTO graph_templates (id, name, description, graph_definition, is_system) VALUES
(
    uuid_generate_v4(),
    'Simple Discussion',
    'A basic discussion flow: agents brainstorm and conclude',
    '{
        "nodes": [
            {"id": "start", "type": "start", "label": "Start", "position": {"x": 100, "y": 200}, "data": {}},
            {"id": "brainstorm", "type": "generate", "label": "Brainstorm", "position": {"x": 300, "y": 200}, "data": {"prompt_template": "Given the topic: {topic}\n\nShare your thoughts and ideas.", "agent_selection": "round_robin", "max_turns": 6}},
            {"id": "end", "type": "end", "label": "Conclusion", "position": {"x": 500, "y": 200}, "data": {"summary_prompt": "Summarize the key points from this discussion."}}
        ],
        "edges": [
            {"id": "e1", "source": "start", "target": "brainstorm"},
            {"id": "e2", "source": "brainstorm", "target": "end"}
        ]
    }',
    TRUE
),
(
    uuid_generate_v4(),
    'Debate Format',
    'Structured debate with evaluation and decision',
    '{
        "nodes": [
            {"id": "start", "type": "start", "label": "Start", "position": {"x": 100, "y": 200}, "data": {}},
            {"id": "opening", "type": "generate", "label": "Opening Statements", "position": {"x": 300, "y": 200}, "data": {"prompt_template": "Topic: {topic}\n\nPresent your opening statement and position on this topic.", "agent_selection": "round_robin", "max_turns": 3}},
            {"id": "rebuttals", "type": "generate", "label": "Rebuttals", "position": {"x": 500, "y": 200}, "data": {"prompt_template": "Respond to the previous arguments. Challenge or support the points made.", "agent_selection": "round_robin", "max_turns": 6}},
            {"id": "evaluate", "type": "evaluate", "label": "Evaluate Arguments", "position": {"x": 700, "y": 200}, "data": {"criteria": ["logical_consistency", "evidence_quality", "persuasiveness"], "voting_method": "score"}},
            {"id": "end", "type": "end", "label": "Conclusion", "position": {"x": 900, "y": 200}, "data": {"summary_prompt": "Summarize the debate and the strength of each position."}}
        ],
        "edges": [
            {"id": "e1", "source": "start", "target": "opening"},
            {"id": "e2", "source": "opening", "target": "rebuttals"},
            {"id": "e3", "source": "rebuttals", "target": "evaluate"},
            {"id": "e4", "source": "evaluate", "target": "end"}
        ]
    }',
    TRUE
)
ON CONFLICT DO NOTHING;

-- Discussion Participants (replaces discussion_agents for new architecture)
-- Each discussion has its own participants with specific model configurations
CREATE TABLE IF NOT EXISTS discussion_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    provider_id UUID NOT NULL REFERENCES llm_providers(id) ON DELETE RESTRICT,
    model_name TEXT NOT NULL,  -- User enters manually per participant
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 1024,
    avatar_color TEXT DEFAULT '#6366f1',
    avatar_emoji TEXT DEFAULT '🤖',
    role TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discussion_participants_discussion
    ON discussion_participants(discussion_id);

-- Migration: model_name → available_models (for existing databases)
-- If model_name column exists, migrate its data to available_models then drop it
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'llm_providers' AND column_name = 'model_name') THEN
        -- Add available_models if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'llm_providers' AND column_name = 'available_models') THEN
            ALTER TABLE llm_providers ADD COLUMN available_models TEXT[] DEFAULT '{}';
        END IF;
        -- Copy model_name into available_models
        UPDATE llm_providers SET available_models = ARRAY[model_name] WHERE model_name IS NOT NULL AND available_models = '{}';
        -- Drop old column
        ALTER TABLE llm_providers DROP COLUMN model_name;
    END IF;
END $$;

-- Migration: Add model_name to agents table (for existing databases)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS model_name TEXT;

-- Migration: Add embedding_model to llm_providers (for existing databases)
ALTER TABLE llm_providers ADD COLUMN IF NOT EXISTS embedding_model TEXT;

-- Update comment on agents table
COMMENT ON TABLE agents IS 'Agent templates - reusable participant configurations';

-- Data migration: Copy existing discussion_agents to discussion_participants
-- This preserves existing discussions while transitioning to new architecture
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
        'default-model'  -- Fallback if no model found
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
