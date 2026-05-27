// lib/ai/constants.ts

export const CHUNK_SIZE = 500
export const CHUNK_OVERLAP = 80
export const MIN_CHUNK_LENGTH = 20
export const TOP_K_RESULTS = 5
export const TASK_POSITION_TOP = 20
export const TASK_POSITION_GAP = 80
export const MESSAGE_HISTORY_LIMIT = 12
export const HYBRID_VECTOR_WEIGHT = 0.7
export const HYBRID_TEXT_WEIGHT = 0.3

export const WRITE_TOOLS = new Set([
  'add_task',
  'update_task',
  'delete_task',
  'add_section',
  'add_checklist_item',
  'link_task_to_item',
  'set_dependency',
  'remove_dependency',
  'assign_tasks_batch',
])

export const SECTION_COLORS = [
  '#EEEDFE', '#FEF3C7', '#D1FAE5', '#FEE2E2',
  '#DBEAFE', '#F3E8FF', '#ECFDF5', '#FFF7ED',
]
