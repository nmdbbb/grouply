// Repro with the REAL project context to capture failed_generation. node .cache/groq-realctx.mjs
import fs from 'node:fs'
import Groq from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync('.env.local', 'utf8')
const g = k => env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1]?.trim()
const groq = new Groq({ apiKey: g('GROQ_API_KEY') })
const sb = createClient(g('NEXT_PUBLIC_SUPABASE_URL'), g('SUPABASE_SERVICE_ROLE_KEY'))
const PROJECT_ID = '08b6c1cb-611b-4091-9a12-e7d2c1b42749'
const USER_PROMPT = 'tạo kế hoạch cho học phần đổi mới sáng tạo và khởi nghiệp'

const [{ data: project }, { data: members }, { data: tasks }, { data: sections }, { data: checklist }] = await Promise.all([
  sb.from('projects').select('*').eq('id', PROJECT_ID).single(),
  sb.from('project_members').select('*, profile:profiles(id, name)').eq('project_id', PROJECT_ID),
  sb.from('tasks').select('*').eq('project_id', PROJECT_ID),
  sb.from('sections').select('*').eq('project_id', PROJECT_ID).order('ord'),
  sb.from('checklist_items').select('*').eq('project_id', PROJECT_ID).order('ord'),
])
if (!project) { console.error('Project not found / RLS blocked'); process.exit(1) }

const mem = (members ?? []).map(m => ({ id: m.profile?.id ?? m.user_id, name: m.profile?.name ?? 'Unknown', role: m.role }))
const owner = mem.find(m => m.role === 'owner') ?? mem[0] ?? { id: 'x', name: 'User', role: 'owner' }
console.log(`Context: ${mem.length} members, ${tasks?.length ?? 0} tasks, ${sections?.length ?? 0} sections, ${checklist?.length ?? 0} checklist items`)

const memberLines = mem.length ? mem.map(m => `- ${m.name} (id: ${m.id})${m.role === 'owner' ? ' [nhóm trưởng]' : ''}`).join('\n') : '(Chưa có thành viên)'
const checklistLines = (checklist ?? []).length ? (checklist).map(ci => `□ ${ci.name}`).join('\n') : 'Chưa có checklist item.'
const system = `Bạn là AI assistant của nhóm, project: "${project.name}".
Môn: ${project.subject || 'Không có'}. Deadline: ${project.deadline}.
THÀNH VIÊN:\n${memberLines}\nNGƯỜI DÙNG: ${owner.name} (id: ${owner.id}, vai trò: ${owner.role})
CHECKLIST:\n${checklistLines}
TOOL RULES — GỌI TOOL TRƯỚC KHI TRẢ LỜI. Lên kế hoạch: gọi search_documents → add_section → add_task (cùng lượt).
ACTION RULES: NGHIÊM CẤM viết text mô tả kế hoạch — phải gọi tool ngay. "tạo kế hoạch" = gọi add_section + add_task ngay. Phân công: dùng assign_tasks_batch, gọi read_member_load trước.
IMPORTANT: Always respond with a text message after calling tools. Tool arguments must be valid JSON. Use real UUIDs from the MEMBERS list above.`

const f = (name, properties, required = []) => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties, required } } })
const tools = [
  f('search_documents', { query: { type: 'string' }, doc_type: { type: 'string', enum: ['project_doc', 'activity_log'] }, use_hybrid: { type: 'boolean' }, match_count: { type: 'number' } }, ['query']),
  f('read_project', { project_id: { type: 'string' } }),
  f('read_task', { task_id: { type: 'string' } }, ['task_id']),
  f('read_member_load', {}),
  f('read_tasks_by_section', { section_id: { type: 'string' }, status: { type: 'string', enum: ['todo', 'doing', 'review', 'done', 'blocked'] } }),
  f('add_task', { name: { type: 'string' }, section: { type: 'string' }, section_id: { type: 'string' }, type: { type: 'string', enum: ['output', 'coordination', 'research', 'review'] }, checklist_item_id: { type: 'string' }, blocked_by_id: { type: 'string' }, deadline: { type: 'string' }, assignee_id: { type: 'string' }, pos_x: { type: 'number' }, pos_y: { type: 'number' } }, ['name', 'type']),
  f('update_task', { task_id: { type: 'string' }, fields: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['todo', 'doing', 'review', 'done', 'blocked'] }, assignee_id: { type: 'string' }, deadline: { type: 'string' }, section_id: { type: 'string' }, checklist_item_id: { type: 'string' }, blocked_by_id: { type: 'string' }, is_optional: { type: 'boolean' } } } }, ['task_id', 'fields']),
  f('delete_task', { task_id: { type: 'string' } }, ['task_id']),
  f('add_section', { name: { type: 'string' }, color: { type: 'string' } }, ['name']),
  f('add_checklist_item', { name: { type: 'string' }, description: { type: 'string' } }, ['name']),
  f('link_task_to_item', { task_id: { type: 'string' }, checklist_item_id: { type: 'string' } }, ['task_id', 'checklist_item_id']),
  f('set_dependency', { task_id: { type: 'string' }, blocked_by_id: { type: 'string' } }, ['task_id', 'blocked_by_id']),
  f('remove_dependency', { task_id: { type: 'string' } }, ['task_id']),
  f('assign_tasks_batch', { assignments: { type: 'array', items: { type: 'object', properties: { task_id: { type: 'string' }, assignee_id: { type: 'string' } }, required: ['task_id', 'assignee_id'] } } }, ['assignments']),
]

let failCount = 0
for (let i = 1; i <= 5; i++) {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', temperature: 0, max_tokens: 1500,
      messages: [{ role: 'system', content: system }, { role: 'user', content: USER_PROMPT }],
      tools, tool_choice: 'auto',
    })
    const tc = res.choices[0].message.tool_calls
    console.log(`#${i} OK — ${tc?.length ?? 0} tool calls: ${(tc ?? []).map(t => t.function.name).join(', ')}`)
  } catch (e) {
    failCount++
    console.log(`#${i} FAILED: ${e.message}`)
    const fg = e.error?.error?.failed_generation ?? e.error?.failed_generation
    if (fg) { console.log('\n=== FAILED_GENERATION ===\n' + fg + '\n=========================\n'); break }
    else console.dir(e.error, { depth: 8 })
  }
}
console.log(`\n${failCount}/5 failed`)
