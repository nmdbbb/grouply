'use client'
import { useState, useCallback } from 'react'
import { NodeResizer } from '@xyflow/react'
import { createClient } from '@/lib/supabase/client'
import type { SectionNodeData } from '@/stores/graphStore'

interface Props {
  data: SectionNodeData
  selected: boolean
}

function nameToHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return h % 360
}

export function SectionNode({ data, selected }: Props) {
  const { section, onUpdated } = data
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(section.name)
  const supabase = createClient()

  const hue = nameToHue(section.name)
  const bandBg = `hsl(${hue}, 55%, 88%)`
  const bandText = `hsl(${hue}, 45%, 28%)`
  const borderColor = `hsl(${hue}, 40%, 78%)`

  const handleRename = useCallback(async () => {
    if (name.trim() && name !== section.name) {
      await supabase.from('sections').update({ name: name.trim() }).eq('id', section.id)
      onUpdated()
    }
    setEditing(false)
  }, [name, section.id, section.name, supabase, onUpdated])

  return (
    <div
      className="w-full h-full relative flex flex-col rounded-xl overflow-hidden"
      style={{ border: `1.5px solid ${borderColor}` }}
    >
      <NodeResizer minWidth={220} minHeight={140} isVisible={selected} />

      <div
        className="h-9 flex items-center px-3 shrink-0"
        style={{ backgroundColor: bandBg }}
      >
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
            className="text-sm font-semibold bg-transparent outline-none flex-1 min-w-0"
            style={{ color: bandText }}
          />
        ) : (
          <span
            className="text-sm font-semibold truncate flex-1 cursor-default select-none"
            style={{ color: bandText }}
            onDoubleClick={() => setEditing(true)}
          >
            {section.name}
          </span>
        )}
      </div>

      <div className="flex-1" style={{ backgroundColor: `hsl(${hue}, 30%, 97%)` }} />
    </div>
  )
}
