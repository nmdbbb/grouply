import type { Node, Edge } from '@xyflow/react'
import type { ToolCall } from '@/stores/chatStore'
import type { ProjectContext } from './context'
import type { Task, TaskType, Section } from '@/types'
import { TASK_POSITION_TOP, TASK_POSITION_GAP, SECTION_COLORS } from './constants'

const SECTION_WIDTH = 320
const SECTION_DEFAULT_HEIGHT = 300

export function buildGhostNodesFromToolCalls(
  toolCalls: ToolCall[],
  context: ProjectContext
): { ghostNodes: Node[]; ghostEdges: Edge[] } {
  const ghostNodes: Node[] = []
  const ghostEdges: Edge[] = []

  // Pass 1 — create ghost section nodes for add_section calls,
  // track temp name→id so add_task can reference them in Pass 2
  const tempSectionNameToId: Record<string, string> = {}
  let newSectionIndex = 0

  for (const tc of toolCalls) {
    if (tc.name !== 'add_section') continue
    const sectionName = tc.input.name as string
    if (!sectionName) continue

    // Don't duplicate if section already exists
    if (context.sections.some(s => s.name.toLowerCase() === sectionName.toLowerCase())) continue

    const tempId = `ghost-section-${sectionName}`
    tempSectionNameToId[sectionName] = tempId

    const xPos = (context.sections.length + newSectionIndex) * SECTION_WIDTH
    newSectionIndex++

    const section: Section = {
      id: tempId,
      project_id: context.projectId,
      name: sectionName,
      color: SECTION_COLORS[((context.sections.length + newSectionIndex - 1) % SECTION_COLORS.length)],
      ord: context.sections.length + newSectionIndex - 1,
      created_at: new Date().toISOString(),
    }

    ghostNodes.push({
      id: `section-${tempId}`,
      type: 'sectionNode',
      position: { x: xPos, y: 0 },
      data: { section, onUpdated: () => {} },
      style: {
        width: 300,
        height: SECTION_DEFAULT_HEIGHT,
        backgroundColor: section.color + '80',
        border: '2px dashed #7C3AED',
        opacity: 0.7,
      },
    })
  }

  // Pass 2 — create ghost task nodes, resolving sections from context OR tempSectionNameToId
  const sectionGhostCount: Record<string, number> = {}

  for (const tc of toolCalls) {
    if (tc.name !== 'add_task') continue
    const input = tc.input as Record<string, unknown>
    const tempId = `ghost-${crypto.randomUUID()}`
    const now = new Date().toISOString()

    const taskType = (input.type as string) || 'output'
    const validType = (['output', 'coordination', 'research', 'review'] as const).includes(taskType as any)
      ? (taskType as TaskType)
      : 'output'

    // Resolve section: UUID in context → name in context → new ghost section
    const sectionIdInput = input.section_id as string | undefined
    const sectionNameInput = input.section as string | undefined
    let resolvedSectionId: string | null = null

    if (sectionIdInput) {
      resolvedSectionId = context.sections.find(s => s.id === sectionIdInput)?.id ?? null
    }
    if (!resolvedSectionId && sectionNameInput) {
      const needle = sectionNameInput.toLowerCase()
      // Existing section in context
      resolvedSectionId = context.sections.find(s =>
        s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase())
      )?.id ?? null
      // New ghost section created in Pass 1
      if (!resolvedSectionId) {
        const tempSectionId = tempSectionNameToId[sectionNameInput]
          ?? Object.entries(tempSectionNameToId).find(([k]) => k.toLowerCase().includes(needle))?.[1]
          ?? null
        if (tempSectionId) resolvedSectionId = tempSectionId
      }
    }

    const sectionKey = resolvedSectionId ?? '__none__'
    const idx = sectionGhostCount[sectionKey] ?? 0
    sectionGhostCount[sectionKey] = idx + 1

    const posX = (input.pos_x as number) || 20
    const posY = (input.pos_y as number) || (TASK_POSITION_TOP + idx * TASK_POSITION_GAP)

    const task: Task = {
      id: tempId,
      project_id: context.projectId,
      name: ((input.name ?? input.title) as string) || '(Không tên)',
      status: 'todo',
      type: validType,
      assignee_id: null,
      deadline: (input.deadline as string) || null,
      section_id: resolvedSectionId,
      checklist_item_id: (input.checklist_item_id as string) || null,
      description: null,
      blocked_by_id: null,
      is_optional: false,
      pos_x: posX,
      pos_y: posY,
      created_by: null,
      created_at: now,
      updated_at: now,
    }

    ghostNodes.push({
      id: tempId,
      type: 'ghostTaskNode',
      position: { x: posX, y: posY },
      parentId: resolvedSectionId ? `section-${resolvedSectionId}` : undefined,
      data: {
        task,
        members: context.members,
        onUpdated: () => {},
      },
    })
  }

  return { ghostNodes, ghostEdges }
}
