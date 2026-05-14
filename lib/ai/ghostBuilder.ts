import type { Node, Edge } from '@xyflow/react'
import type { ToolCall } from '@/stores/chatStore'
import type { ProjectContext } from './context'
import type { Task } from '@/types'

export function buildGhostNodesFromToolCalls(
  toolCalls: ToolCall[],
  context: ProjectContext
): { ghostNodes: Node[]; ghostEdges: Edge[] } {
  const ghostNodes: Node[] = []
  const ghostEdges: Edge[] = []
  let offsetY = 0

  for (const tc of toolCalls) {
    if (tc.name === 'add_task') {
      const input = tc.input as Record<string, unknown>
      const tempId = `ghost-${crypto.randomUUID()}`
      const now = new Date().toISOString()
      
      const task: Task = {
        id: tempId,
        project_id: context.projectId,
        name: input.name as string,
        status: 'todo',
        type: (input.type as string) || 'output',
        assignee_id: null,
        deadline: (input.deadline as string) || null,
        section_id: (input.section_id as string) || null,
        checklist_item_id: (input.checklist_item_id as string) || null,
        description: null,
        blocked_by_id: null,
        is_optional: false,
        pos_x: (input.pos_x as number) || 50,
        pos_y: ((input.pos_y as number) || 50) + offsetY,
        created_by: null,
        created_at: now,
        updated_at: now,
      }

      ghostNodes.push({
        id: tempId,
        type: 'ghostTaskNode',
        position: { x: task.pos_x, y: task.pos_y },
        data: {
          task,
          members: context.members,
          onUpdated: () => {},
        },
      })
      offsetY += 120
    }
  }

  return { ghostNodes, ghostEdges }
}
