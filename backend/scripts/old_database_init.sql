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
    model_name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
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
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
