'use client'
import { useState, useCallback } from 'react'
import { NodeResizer } from '@xyflow/react'
import { createClient } from '@/lib/supabase/client'
import type { SectionNodeData } from '@/stores/graphStore'

interface Props {
  data: SectionNodeData
  selected: boolean
}

export function SectionNode({ data, selected }: Props) {
  const { section, onUpdated } = data
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(section.name)
  const supabase = createClient()

  const handleRename = useCallback(async () => {
    if (name.trim() && name !== section.name) {
      await supabase.from('sections').update({ name: name.trim() }).eq('id', section.id)
      onUpdated()
    }
    setEditing(false)
  }, [name, section.id, section.name, supabase, onUpdated])

  return (
    <div className="w-full h-full relative">
      <NodeResizer minWidth={200} minHeight={120} isVisible={selected} />
      <div className="absolute top-2 left-3 flex items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
            className="text-sm font-semibold bg-transparent border-b border-gray-400 outline-none"
          />
        ) : (
          <span
            className="text-sm font-semibold text-gray-700 cursor-pointer"
            onDoubleClick={() => setEditing(true)}
          >
            {section.name}
          </span>
        )}
      </div>
    </div>
  )
}
