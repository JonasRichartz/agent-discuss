-- LLM Providers policies
  CREATE POLICY "Users can view their own providers"
    ON llm_providers FOR SELECT
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can create their own providers"
    ON llm_providers FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own providers"
    ON llm_providers FOR UPDATE
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own providers"
    ON llm_providers FOR DELETE
    USING (auth.uid() = user_id);

  -- Agents policies
  CREATE POLICY "Users can view their own agents"
    ON agents FOR SELECT
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can create their own agents"
    ON agents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own agents"
    ON agents FOR UPDATE
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own agents"
    ON agents FOR DELETE
    USING (auth.uid() = user_id);

  -- Templates policies
  CREATE POLICY "Users can view system templates and their own"
    ON graph_templates FOR SELECT
    USING (is_system = true OR auth.uid() = user_id);

  CREATE POLICY "Users can create their own templates"
    ON graph_templates FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own templates"
    ON graph_templates FOR UPDATE
    USING (auth.uid() = user_id AND is_system = false);

  CREATE POLICY "Users can delete their own templates"
    ON graph_templates FOR DELETE
    USING (auth.uid() = user_id AND is_system = false);

  -- Discussions policies
  CREATE POLICY "Users can view their own discussions"
    ON discussions FOR SELECT
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can create their own discussions"
    ON discussions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own discussions"
    ON discussions FOR UPDATE
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own discussions"
    ON discussions FOR DELETE
    USING (auth.uid() = user_id);

  -- Messages policies
  CREATE POLICY "Users can view messages from their discussions"
    ON messages FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM discussions
      WHERE discussions.id = messages.discussion_id
      AND discussions.user_id = auth.uid()
    ));

  CREATE POLICY "Users can create messages in their discussions"
    ON messages FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM discussions
      WHERE discussions.id = messages.discussion_id
      AND discussions.user_id = auth.uid()
    ));

  -- Documents policies
  CREATE POLICY "Users can view their own documents"
    ON documents FOR SELECT
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can create their own documents"
    ON documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own documents"
    ON documents FOR UPDATE
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own documents"
    ON documents FOR DELETE
    USING (auth.uid() = user_id);