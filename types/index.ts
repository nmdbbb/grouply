// types/index.ts
export type UserRole = 'owner' | 'member'
export type TaskStatus = 'todo' | 'doing' | 'review' | 'done' | 'blocked'
export type TaskType = 'output' | 'coordination' | 'research' | 'review'
export type HistoryAction = 'status_changed' | 'assigned' | 'created' | 'updated' | 'deleted'

export interface Profile {
  id: string
  name: string
  avatar_url: string | null
  byok_key: string | null
  created_at: string
}

export interface Project {
  id: string
  name: string
  subject: string | null
  description: string | null
  deadline: string
  owner_id: string
  created_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: UserRole
  joined_at: string
  profile?: Profile
}

export interface Section {
  id: string
  project_id: string
  name: string
  color: string
  ord: number
  created_at: string
}

export interface ChecklistItem {
  id: string
  project_id: string
  name: string
  description: string | null
  ord: number
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  section_id: string | null
  checklist_item_id: string | null
  name: string
  description: string | null
  assignee_id: string | null
  status: TaskStatus
  type: TaskType
  deadline: string | null
  blocked_by_id: string | null
  is_optional: boolean
  pos_x: number
  pos_y: number
  created_by: string | null
  created_at: string
  updated_at: string
  assignee?: Profile
  section?: Section
}

export interface TaskClaim {
  id: string
  task_id: string
  user_id: string
  created_at: string
  profile?: Profile
}

export interface TaskDocument {
  id: string
  task_id: string
  url: string
  name: string | null
  created_by: string | null
  created_at: string
}

export interface TaskHistory {
  id: string
  task_id: string
  user_id: string
  action: HistoryAction
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
  profile?: Profile
}

export interface ProjectInvite {
  id: string
  project_id: string
  token: string
  created_by: string | null
  expires_at: string | null
  created_at: string
}

export interface ProjectWithDetails extends Project {
  members: ProjectMember[]
  checklist_items: ChecklistItem[]
  tasks: Task[]
}

export type VectorChunk = {
  source: 'vector'
  similarity: number
  content: string
  document_name: string
  chunk_index: number
  doc_type?: string
  metadata?: Record<string, unknown>
}

export type HybridChunk = {
  source: 'hybrid'
  combined_score: number
  content: string
  document_name: string
  chunk_index: number
  doc_type?: string
  metadata?: Record<string, unknown>
}

export type RetrievedChunk = VectorChunk | HybridChunk

export function getChunkScore(chunk: RetrievedChunk): number {
  return chunk.source === 'vector' ? chunk.similarity : chunk.combined_score
}
