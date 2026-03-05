# Supabase Migration Guide

## ⚠️ Important: Do NOT Delete Anything!

Your existing Supabase setup is fine. This migration only **adds** new features without breaking existing functionality.

## What This Migration Does

### Adds New Features ✅
- Creates `discussion_participants` table (new)
- Adds RLS policies for participants
- Makes `llm_providers.model_name` nullable
- Migrates existing data automatically

### Does NOT Touch ❌
- Your existing tables remain unchanged
- Existing RLS policies stay as-is
- All current data is preserved
- `discussion_agents` table stays (backward compatible)

---

## Step-by-Step Migration Instructions

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase dashboard: https://rhwhgejqwweoutxsfgin.supabase.co
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Run the Migration Script

1. Open the file: `backend/scripts/supabase_migration.sql`
2. Copy **ALL** the contents
3. Paste into the Supabase SQL Editor
4. Click **Run** (or press Ctrl/Cmd + Enter)

**Expected Result:**
```
Success. No rows returned
```

### Step 3: Verify the Migration

Run this query to check the new table exists:

```sql
SELECT COUNT(*) as participant_count
FROM discussion_participants;
```

You should see a count of migrated participants (could be 0 if you have no discussions yet).

### Step 4: Check RLS Policies

Run this query to verify RLS policies were created:

```sql
SELECT tablename, policyname
FROM pg_policies
WHERE tablename = 'discussion_participants';
```

You should see 4 policies:
- Users can view their discussion participants
- Users can create participants in draft discussions
- Users can update participants in draft discussions
- Users can delete participants from draft discussions

---

## What If Something Goes Wrong?

### The migration is **idempotent** (safe to run multiple times)

If you get an error, you can:

1. **Read the error message** - it will tell you what failed
2. **Run the script again** - it uses `IF NOT EXISTS` and `ON CONFLICT DO NOTHING`
3. **Nothing will be deleted** - worst case, some parts already exist and will be skipped

### Common Issues

#### Error: "relation already exists"
**Solution:** This is fine! It means the table was already created. The migration will skip it.

#### Error: "column does not exist"
**Solution:** Check that you ran your initial setup scripts first. You need the base tables before running this migration.

#### Error: "permission denied"
**Solution:** Make sure you're using the Supabase SQL Editor, not a regular SQL client. The editor has the right permissions.

---

## After Migration: How to Test

### Test 1: Check New Table Structure

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'discussion_participants'
ORDER BY ordinal_position;
```

You should see columns: id, discussion_id, name, system_prompt, provider_id, model_name, etc.

### Test 2: Check Data Migration

```sql
-- Compare counts
SELECT
  (SELECT COUNT(*) FROM discussion_agents) as old_count,
  (SELECT COUNT(*) FROM discussion_participants) as new_count;
```

The counts should match (or new_count >= old_count if you had discussions).

### Test 3: Check Model Name Nullable

```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'llm_providers'
AND column_name = 'model_name';
```

`is_nullable` should be `YES`.

---

## Understanding the Architecture Change

### Before (Old Way)
```
agents (global) → discussion_agents → discussions
llm_providers.model_name = required
```

- Agents were global and reused
- Provider had one model for all agents
- Changing model meant changing provider

### After (New Way)
```
agents (templates) → discussion_participants → discussions
llm_providers.model_name = optional
participant.model_name = per-participant
```

- Agents are now templates
- Each discussion has its own participants
- Each participant can use a different model
- Provider stores connection info only

### Backward Compatibility

Both systems work! Your existing discussions using `discussion_agents` will continue to work. New discussions can use `discussion_participants` for more flexibility.

---

## Rollback (If Needed)

If you need to undo this migration:

```sql
-- Remove new table and policies
DROP TABLE IF EXISTS discussion_participants CASCADE;

-- Restore model_name to NOT NULL (optional, only if needed)
-- ALTER TABLE llm_providers ALTER COLUMN model_name SET NOT NULL;
```

**But you probably won't need this!** The migration is safe and doesn't break anything.

---

## Next Steps After Migration

1. ✅ **Migration complete** - Your database now supports the new participant system
2. 🧪 **Test the frontend** - Create a new discussion and test message display
3. 🔧 **Test the API** - Use http://localhost:8000/docs to test participant endpoints
4. 📝 **Create participants** - Either via API or wait for frontend UI

---

## Questions?

- **Do I need to update my code?** No! The backend is already updated and ready.
- **Will my existing discussions break?** No! They'll continue using the old system.
- **Can I still create discussions the old way?** Yes! Backward compatible.
- **When should I use participants vs agents?** New discussions should use participants for more flexibility.

---

## Summary Checklist

- [ ] Opened Supabase SQL Editor
- [ ] Ran `supabase_migration.sql` script
- [ ] Verified new table exists
- [ ] Checked RLS policies created
- [ ] Tested data migration (optional)
- [ ] Ready to test new features!

**You're all set!** 🎉
