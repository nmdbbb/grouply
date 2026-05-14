-- supabase/migrations/001_init.sql

-- Profiles
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name        text NOT NULL,
  avatar_url  text,
  byok_key    text,
  created_at  timestamptz DEFAULT now()
);

-- Projects
CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  subject     text,
  description text,
  deadline    date NOT NULL,
  owner_id    uuid REFERENCES profiles ON DELETE RESTRICT NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Project members
CREATE TABLE project_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles ON DELETE CASCADE,
  role        text DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at   timestamptz DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Sections
CREATE TABLE sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects ON DELETE CASCADE,
  name        text NOT NULL,
  color       text DEFAULT '#EEEDFE',
  ord         integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Checklist items
CREATE TABLE checklist_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  ord         integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Tasks
CREATE TABLE tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid REFERENCES projects ON DELETE CASCADE,
  section_id        uuid REFERENCES sections ON DELETE SET NULL,
  checklist_item_id uuid REFERENCES checklist_items ON DELETE SET NULL,
  name              text NOT NULL,
  description       text,
  assignee_id       uuid REFERENCES profiles ON DELETE SET NULL,
  status            text DEFAULT 'todo' CHECK (status IN ('todo','doing','review','done','blocked')),
  type              text DEFAULT 'output' CHECK (type IN ('output','coordination','research','review')),
  deadline          date,
  blocked_by_id     uuid REFERENCES tasks ON DELETE SET NULL,
  is_optional       boolean DEFAULT false,
  pos_x             float DEFAULT 0,
  pos_y             float DEFAULT 0,
  created_by        uuid REFERENCES profiles ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Task claims
CREATE TABLE task_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid REFERENCES tasks ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(task_id, user_id)
);

-- Task documents
CREATE TABLE task_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid REFERENCES tasks ON DELETE CASCADE,
  url         text NOT NULL,
  name        text,
  created_by  uuid REFERENCES profiles ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

-- Task history
CREATE TABLE task_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid REFERENCES tasks ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles ON DELETE CASCADE,
  action      text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Project invites
CREATE TABLE project_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects ON DELETE CASCADE,
  token       text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  created_by  uuid REFERENCES profiles ON DELETE SET NULL,
  expires_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

-- updated_at trigger for tasks
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE task_claims;
ALTER PUBLICATION supabase_realtime ADD TABLE task_history;
ALTER PUBLICATION supabase_realtime ADD TABLE checklist_items;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;

-- Helper: is_project_member
CREATE OR REPLACE FUNCTION is_project_member(pid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = pid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: is_project_owner
CREATE OR REPLACE FUNCTION is_project_owner(pid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = pid AND user_id = auth.uid() AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- profiles policies
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- projects policies
CREATE POLICY "projects_select" ON projects FOR SELECT USING (is_project_member(id));
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (is_project_owner(id));
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (is_project_owner(id));

-- project_members policies
CREATE POLICY "members_select" ON project_members FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "members_insert" ON project_members FOR INSERT WITH CHECK (
  is_project_owner(project_id) OR user_id = auth.uid()
);
CREATE POLICY "members_delete" ON project_members FOR DELETE USING (
  is_project_owner(project_id) OR user_id = auth.uid()
);

-- sections policies
CREATE POLICY "sections_select" ON sections FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "sections_insert" ON sections FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "sections_update" ON sections FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "sections_delete" ON sections FOR DELETE USING (is_project_owner(project_id));

-- checklist_items policies
CREATE POLICY "checklist_select" ON checklist_items FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "checklist_insert" ON checklist_items FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "checklist_update" ON checklist_items FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "checklist_delete" ON checklist_items FOR DELETE USING (is_project_owner(project_id));

-- tasks policies
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (is_project_member(project_id));
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (is_project_member(project_id));
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (is_project_owner(project_id));

-- task_claims policies
CREATE POLICY "claims_select" ON task_claims FOR SELECT USING (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);
CREATE POLICY "claims_insert" ON task_claims FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "claims_delete" ON task_claims FOR DELETE USING (user_id = auth.uid());

-- task_documents policies
CREATE POLICY "docs_select" ON task_documents FOR SELECT USING (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);
CREATE POLICY "docs_insert" ON task_documents FOR INSERT WITH CHECK (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);
CREATE POLICY "docs_delete" ON task_documents FOR DELETE USING (created_by = auth.uid());

-- task_history policies
CREATE POLICY "history_select" ON task_history FOR SELECT USING (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);
CREATE POLICY "history_insert" ON task_history FOR INSERT WITH CHECK (
  is_project_member((SELECT project_id FROM tasks WHERE id = task_id))
);

-- project_invites policies
CREATE POLICY "invites_select" ON project_invites FOR SELECT USING (true);
CREATE POLICY "invites_insert" ON project_invites FOR INSERT WITH CHECK (is_project_owner(project_id));
CREATE POLICY "invites_delete" ON project_invites FOR DELETE USING (is_project_owner(project_id));
