-- supabase/migrations/005_byok_keys.sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS byok_keys jsonb DEFAULT '{}'::jsonb;
