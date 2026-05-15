import type { Tool } from '@anthropic-ai/sdk/resources'

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'read_project',
    description: 'Đọc toàn bộ state của project: tasks, members, checklist items, sections.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID của project' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'read_task',
    description: 'Đọc chi tiết một task.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'ID của task' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'read_member_load',
    description: 'Xem workload của từng thành viên.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'ID của project' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'parse_brief',
    description: 'Phân tích đề bài và đề xuất checklist items + task list.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Nội dung đề bài' },
        deadline: { type: 'string', description: 'Deadline dự án (YYYY-MM-DD)' },
        member_count: { type: 'number', description: 'Số thành viên trong nhóm' },
      },
      required: ['content', 'deadline', 'member_count'],
    },
  },
  {
    name: 'add_task',
    description: 'Thêm task mới vào project.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên task' },
        section: { type: 'string', description: 'Tên section chứa task (dùng thay cho section_id nếu không có UUID)' },
        section_id: { type: 'string', description: 'UUID section chứa task (nếu đã biết)' },
        type: { type: 'string', enum: ['output', 'coordination', 'research', 'review'] },
        checklist_item_id: { type: 'string', description: 'optional' },
        blocked_by_id: { type: 'string', description: 'optional' },
        deadline: { type: 'string', description: 'YYYY-MM-DD, optional' },
        assignee_id: { type: 'string', description: 'optional' },
        pos_x: { type: 'number' },
        pos_y: { type: 'number' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'update_task',
    description: 'Cập nhật thông tin của một task.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        fields: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['todo', 'doing', 'review', 'done', 'blocked'] },
            assignee_id: { type: 'string' },
            deadline: { type: 'string' },
            section_id: { type: 'string' },
            checklist_item_id: { type: 'string' },
            blocked_by_id: { type: 'string' },
            is_optional: { type: 'boolean' },
          },
        },
      },
      required: ['task_id', 'fields'],
    },
  },
  {
    name: 'delete_task',
    description: 'Xóa task. Chỉ owner.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
  {
    name: 'add_section',
    description: 'Thêm section mới.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string', description: 'hex color optional' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_checklist_item',
    description: 'Thêm deliverable item vào checklist.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string', description: 'optional' },
      },
      required: ['name'],
    },
  },
  {
    name: 'link_task_to_item',
    description: 'Liên kết task với checklist item.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        checklist_item_id: { type: 'string' },
      },
      required: ['task_id', 'checklist_item_id'],
    },
  },
  {
    name: 'set_dependency',
    description: 'Tạo dependency: task bị block bởi task khác.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        blocked_by_id: { type: 'string' },
      },
      required: ['task_id', 'blocked_by_id'],
    },
  },
  {
    name: 'remove_dependency',
    description: 'Xóa dependency của task.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
  {
    name: 'assign_tasks_batch',
    description: 'Phân công hàng loạt tasks cho các thành viên. Dùng khi owner muốn giao việc theo giai đoạn hoặc member muốn nhận việc.',
    input_schema: {
      type: 'object',
      properties: {
        assignments: {
          type: 'array',
          description: 'Danh sách phân công',
          items: {
            type: 'object',
            properties: {
              task_id: { type: 'string', description: 'UUID của task' },
              assignee_id: { type: 'string', description: 'UUID của thành viên được assign' },
            },
            required: ['task_id', 'assignee_id'],
          },
        },
      },
      required: ['assignments'],
    },
  },
]
