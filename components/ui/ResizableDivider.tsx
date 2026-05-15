'use client'
import { useCallback, useRef } from 'react'

interface Props {
  onResize: (delta: number) => void
  direction?: 'horizontal' | 'vertical'
}

export function ResizableDivider({ onResize, direction = 'horizontal' }: Props) {
  const dragging = useRef(false)
  const lastPos = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const pos = direction === 'horizontal' ? ev.clientX : ev.clientY
      const delta = pos - lastPos.current
      lastPos.current = pos
      onResize(delta)
    }

    const onMouseUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [onResize, direction])

  return (
    <div
      onMouseDown={onMouseDown}
      className={`
        shrink-0 bg-transparent hover:bg-blue-400 active:bg-blue-500
        transition-colors duration-100 group relative z-10
        ${direction === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
      `}
    >
      <div className={`
        absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity
        ${direction === 'horizontal' ? 'w-px left-1/2 -translate-x-1/2 h-full' : 'h-px top-1/2 -translate-y-1/2 w-full'}
        bg-blue-400
      `} />
    </div>
  )
}
