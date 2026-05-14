import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MemberAvatarStack } from '@/components/project/MemberAvatarStack'
import { formatDeadline, daysUntil } from '@/lib/utils'
import type { Project, ProjectMember, ChecklistItem } from '@/types'

interface Props {
  project: Project
  members: ProjectMember[]
  checklistItems: ChecklistItem[]
  doneCount: number
}

export function ProjectCard({ project, members, checklistItems, doneCount }: Props) {
  const days = daysUntil(project.deadline)
  const total = checklistItems.length

  return (
    <Link href={`/project/${project.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm leading-tight">{project.name}</h3>
              {project.subject && (
                <p className="text-xs text-muted-foreground mt-0.5">{project.subject}</p>
              )}
            </div>
            <Badge variant={days < 3 ? 'destructive' : 'secondary'} className="text-xs shrink-0">
              {formatDeadline(project.deadline)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{doneCount}/{total} items ✓</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-600 rounded-full transition-all"
                  style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          <MemberAvatarStack members={members} max={5} />
        </CardContent>
      </Card>
    </Link>
  )
}
