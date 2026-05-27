import { tool } from 'ai'
import { z } from 'zod'
import { zodSchema } from 'ai'
import { buildProjectContext } from '../context'
import { executeToolCall } from './dispatcher'

function exec(name: string, input: Record<string, unknown>, projectId: string, userId: string, supabase: any) {
  return executeToolCall({ name, input, id: name }, projectId, userId, supabase).then(r => r.result)
}

export function buildTools(projectId: string, userId: string, supabase: any) {
  return {
    search_documents: tool({
      description: `Tìm kiếm ngữ nghĩa trong tài liệu và lịch sử hoạt động của dự án.

Hai corpus:
- doc_type="project_doc": đề bài, rubric, tài liệu tham khảo (file đã upload)
- doc_type="activity_log": lịch sử mọi hành động AI đã thực hiện trong dự án

Khi nào dùng:
- Hỏi về yêu cầu đề bài, tiêu chí chấm → doc_type="project_doc"
- Hỏi lịch sử ("AI đã làm gì?", "tại sao task này assign cho X?") → doc_type="activity_log"
- Hỏi chung không chắc loại → bỏ trống doc_type
- Query có keyword cụ thể (tên người, con số, thuật ngữ) → use_hybrid=true`,
      inputSchema: zodSchema(z.object({
        query: z.string().describe('Câu truy vấn tìm kiếm'),
        doc_type: z.enum(['project_doc', 'activity_log']).optional(),
        use_hybrid: z.boolean().optional(),
        match_count: z.number().optional(),
      })),
      execute: (input) => exec('search_documents', input as any, projectId, userId, supabase),
    }),

    read_project: tool({
      description: 'Đọc toàn bộ state của project: tasks, members, checklist items, sections.',
      inputSchema: zodSchema(z.object({ project_id: z.string().optional() })),
      execute: () => buildProjectContext(projectId),
    }),

    read_task: tool({
      description: 'Đọc chi tiết một task.',
      inputSchema: zodSchema(z.object({ task_id: z.string() })),
      execute: (input) => exec('read_task', input, projectId, userId, supabase),
    }),

    read_member_load: tool({
      description: 'Xem workload của từng thành viên.',
      inputSchema: zodSchema(z.object({})),
      execute: () => exec('read_member_load', {}, projectId, userId, supabase),
    }),

    read_tasks_by_section: tool({
      description: 'Đọc tasks của một hoặc tất cả sections.',
      inputSchema: zodSchema(z.object({
        section_id: z.string().optional(),
        status: z.enum(['todo', 'doing', 'review', 'done', 'blocked']).optional(),
      })),
      execute: (input) => exec('read_tasks_by_section', input, projectId, userId, supabase),
    }),

    add_task: tool({
      description: 'Thêm task mới vào project.',
      inputSchema: zodSchema(z.object({
        name: z.string(),
        section: z.string().optional(),
        section_id: z.string().optional(),
        type: z.enum(['output', 'coordination', 'research', 'review']),
        checklist_item_id: z.string().optional(),
        blocked_by_id: z.string().optional(),
        deadline: z.string().optional(),
        assignee_id: z.string().optional(),
        pos_x: z.number().optional(),
        pos_y: z.number().optional(),
      })),
    }),

    update_task: tool({
      description: 'Cập nhật thông tin của một task.',
      inputSchema: zodSchema(z.object({
        task_id: z.string(),
        fields: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          status: z.enum(['todo', 'doing', 'review', 'done', 'blocked']).optional(),
          assignee_id: z.string().optional(),
          deadline: z.string().optional(),
          section_id: z.string().optional(),
          checklist_item_id: z.string().optional(),
          blocked_by_id: z.string().optional(),
          is_optional: z.boolean().optional(),
        }),
      })),
    }),

    delete_task: tool({
      description: 'Xóa task. Chỉ owner.',
      inputSchema: zodSchema(z.object({ task_id: z.string() })),
    }),

    add_section: tool({
      description: 'Thêm section mới.',
      inputSchema: zodSchema(z.object({
        name: z.string(),
        color: z.string().optional(),
      })),
    }),

    add_checklist_item: tool({
      description: 'Thêm deliverable item vào checklist.',
      inputSchema: zodSchema(z.object({
        name: z.string(),
        description: z.string().optional(),
      })),
    }),

    link_task_to_item: tool({
      description: 'Liên kết task với checklist item.',
      inputSchema: zodSchema(z.object({
        task_id: z.string(),
        checklist_item_id: z.string(),
      })),
    }),

    set_dependency: tool({
      description: 'Tạo dependency: task bị block bởi task khác.',
      inputSchema: zodSchema(z.object({
        task_id: z.string(),
        blocked_by_id: z.string(),
      })),
    }),

    remove_dependency: tool({
      description: 'Xóa dependency của task.',
      inputSchema: zodSchema(z.object({ task_id: z.string() })),
    }),

    assign_tasks_batch: tool({
      description: 'Phân công hàng loạt tasks cho các thành viên.',
      inputSchema: zodSchema(z.object({
        assignments: z.array(z.object({
          task_id: z.string(),
          assignee_id: z.string(),
        })),
      })),
    }),
  }
}
