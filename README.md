# Grouply

Grouply là ứng dụng quản lý dự án nhóm dành cho sinh viên, được xây dựng xoay quanh một AI assistant thực sự hiểu dự án của bạn.

Thay vì chỉ quản lý task thủ công, Grouply cho phép cả nhóm trò chuyện với AI để lên kế hoạch, phân công công việc, kiểm tra tiến độ, và tìm kiếm thông tin trong tài liệu đề bài — tất cả trong cùng một không gian làm việc.

---

## AI hiểu ngữ cảnh dự án của bạn

AI trong Grouply không phải chatbot thông thường. Nó được cấp toàn bộ context của dự án — danh sách thành viên, tasks, sections, checklist, deadline — và có thể trực tiếp thao tác lên dữ liệu đó.

Bạn có thể nhắn:

> *"Tạo kế hoạch làm báo cáo cho tuần này, chia đều cho 4 người"*

và AI sẽ tạo sections, tasks, phân công — rồi hỏi bạn xác nhận trước khi áp dụng.

Ngoài ra, AI có thể tìm kiếm semantic trong tài liệu nhóm đã upload (đề bài, rubric, slide) để trả lời các câu hỏi như *"tiêu chí chấm điểm phần thuyết trình là gì?"* mà không cần bạn tự tra.

---

## Workspace đa chế độ

Grouply cung cấp nhiều góc nhìn khác nhau cho cùng một dự án:

- **Danh sách** — xem và chỉnh sửa tasks theo từng section
- **Graph** — visualize dependency giữa các tasks, thấy ngay task nào đang bị block
- **Timeline** — Gantt chart theo deadline
- **Tài liệu** — quản lý file đề bài, rubric, tài liệu tham khảo đã upload

Mọi thay đổi đồng bộ real-time cho toàn bộ thành viên trong nhóm.

---

## Tính năng nổi bật

- **Checklist deliverables** — định nghĩa các mục bàn giao của dự án, gắn tasks vào từng mục, theo dõi % hoàn thành tự động
- **Dependency tracking** — đặt quan hệ blocking giữa tasks để biết task nào cần làm trước
- **Contribution bar** — xem phân bổ công việc theo thành viên để cân bằng workload
- **Phân quyền** — nhóm trưởng (owner) có toàn quyền; thành viên không thể xóa task của người khác
- **BYOK** — nhóm dùng API key AI của riêng mình, không chia sẻ với bất kỳ bên thứ ba nào

---

## AI Tools

AI có thể gọi các tools sau trong một lượt chat:

| Tool | Mô tả |
|---|---|
| `read_project` | Đọc toàn bộ state: tasks, members, sections, checklist |
| `read_task` | Chi tiết một task |
| `read_member_load` | Workload từng thành viên |
| `read_tasks_by_section` | Tasks theo section |
| `search_documents` | Tìm kiếm semantic trong tài liệu nhóm |
| `add_task` | Tạo task mới |
| `update_task` | Cập nhật task |
| `delete_task` | Xóa task (owner only) |
| `add_section` | Tạo section mới |
| `add_checklist_item` | Thêm deliverable vào checklist |
| `link_task_to_item` | Gắn task với checklist item |
| `set_dependency` | Tạo quan hệ blocking giữa tasks |
| `remove_dependency` | Xóa dependency |
| `assign_tasks_batch` | Phân công hàng loạt |

Write tools yêu cầu user xác nhận trước khi áp dụng.

---

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS, shadcn/ui |
| AI | Vercel AI SDK, hỗ trợ nhiều AI providers |
| Database | Supabase (PostgreSQL, pgvector, Auth, Storage) |
| Graph | React Flow, dagre layout |
| State | Zustand |
| Embedding | @xenova/transformers (chạy local trên browser) |

---

## License

MIT
