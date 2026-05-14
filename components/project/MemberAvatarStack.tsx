import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import type { ProjectMember } from '@/types'

interface Props {
  members: ProjectMember[]
  max?: number
}

export function MemberAvatarStack({ members, max = 5 }: Props) {
  const visible = members.slice(0, max)
  const overflow = members.length - max

  return (
    <div className="flex -space-x-2">
      {visible.map(m => (
        <Avatar key={m.id} className="h-7 w-7 border-2 border-white">
          <AvatarImage src={m.profile?.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs">
            {getInitials(m.profile?.name ?? '?')}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <div className="h-7 w-7 rounded-full border-2 border-white bg-muted flex items-center justify-center text-xs text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  )
}
