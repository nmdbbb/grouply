'use client'
import { WorkspaceData } from './workspace/WorkspaceData'
import { WorkspaceLayout } from './workspace/WorkspaceLayout'
import type { Task, Section, ChecklistItem, Project } from '@/types'
import type { ProjectContext } from '@/lib/ai/context'

interface Props {
  project: Project
  userId: string
  userRole: 'owner' | 'member'
  initialSections: Section[]
  initialTasks: Task[]
  initialChecklistItems: ChecklistItem[]
  members: { id: string; name: string; avatar_url: string | null; role: string }[]
  aiContext: ProjectContext
  currentUserName: string
}

export function WorkspaceClient(props: Props) {
  return (
    <WorkspaceData
      projectId={props.project.id}
      initialSections={props.initialSections}
      initialTasks={props.initialTasks}
    >
      {({ liveSections, liveTasks, pendingBrief: _pendingBrief, reloadData }) => (
        <WorkspaceLayout
          project={props.project}
          userId={props.userId}
          userRole={props.userRole}
          liveSections={liveSections}
          liveTasks={liveTasks}
          initialChecklistItems={props.initialChecklistItems}
          members={props.members}
          aiContext={props.aiContext}
          currentUserName={props.currentUserName}
          reloadData={reloadData}
        />
      )}
    </WorkspaceData>
  )
}
