  -- Discussion Agents junction table policies
  CREATE POLICY "Users can view their discussion agents"                        
    ON discussion_agents FOR SELECT                         
    USING (EXISTS (
      SELECT 1 FROM discussions
      WHERE discussions.id = discussion_agents.discussion_id
      AND discussions.user_id = auth.uid()
    ));

  CREATE POLICY "Users can add agents to their discussions"
    ON discussion_agents FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM discussions
      WHERE discussions.id = discussion_agents.discussion_id
      AND discussions.user_id = auth.uid()
    ));

  CREATE POLICY "Users can remove agents from their discussions"
    ON discussion_agents FOR DELETE
    USING (EXISTS (
      SELECT 1 FROM discussions
      WHERE discussions.id = discussion_agents.discussion_id
      AND discussions.user_id = auth.uid()
    ));

  -- Discussion Documents junction table policies
  CREATE POLICY "Users can view their discussion documents"
    ON discussion_documents FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM discussions
      WHERE discussions.id = discussion_documents.discussion_id
      AND discussions.user_id = auth.uid()
    ));

  CREATE POLICY "Users can add documents to their discussions"
    ON discussion_documents FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM discussions
      WHERE discussions.id = discussion_documents.discussion_id
      AND discussions.user_id = auth.uid()
    ));

  CREATE POLICY "Users can remove documents from their discussions"
    ON discussion_documents FOR DELETE
    USING (EXISTS (
      SELECT 1 FROM discussions
      WHERE discussions.id = discussion_documents.discussion_id
      AND discussions.user_id = auth.uid()
    ));
