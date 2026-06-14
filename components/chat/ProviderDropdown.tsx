// components/chat/ProviderDropdown.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { PROVIDERS } from '@/lib/ai/providers'
import type { ProviderId } from '@/lib/ai/providers'
import type { ChatMode } from '@/stores/chatStore'

interface Props {
  provider: ProviderId | null
  mode: ChatMode
  onSelect: (p: ProviderId) => void
  onSetMode: (m: ChatMode) => void
}

export function ProviderDropdown({ provider, mode, onSelect, onSetMode }: Props) {
  const [open, setOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({})
  const [pendingProvider, setPendingProvider] = useState<ProviderId | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/user/byok')
      .then(r => r.json())
      .then(d => setSavedKeys(d.keys ?? {}))
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setPendingProvider(null)
        setKeyInput('')
        setError('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelectProvider(id: ProviderId) {
    if (savedKeys[id]) {
      onSetMode('api')
      onSelect(id)
      setOpen(false)
    } else {
      setPendingProvider(id)
      setKeyInput('')
      setError('')
    }
  }

  function handleSelectSimulate() {
    onSetMode('simulate')
    setOpen(false)
  }

  async function handleSaveKey() {
    if (!pendingProvider || !keyInput.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/user/byok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: pendingProvider, key: keyInput.trim() }),
    })
    setSaving(false)
    if (!res.ok) { setError('Lưu thất bại, thử lại.'); return }
    setSavedKeys(prev => ({ ...prev, [pendingProvider]: true }))
    onSelect(pendingProvider)
    setPendingProvider(null)
    setKeyInput('')
    setOpen(false)
  }

  const activeLabel = mode === 'simulate' ? 'Simulate' : provider ? PROVIDERS[provider].label : 'Chọn AI'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); setPendingProvider(null); setKeyInput('') }}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 font-medium"
      >
        {activeLabel}
        <span className="text-muted-foreground">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border rounded-lg shadow-lg w-52">
          {pendingProvider ? (
            <div className="p-3 space-y-2">
              <p className="text-xs font-medium">{PROVIDERS[pendingProvider].label} API Key</p>
              <input
                autoFocus
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                placeholder={PROVIDERS[pendingProvider].placeholder}
                className="w-full text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <p className="text-xs text-muted-foreground">Key được mã hóa trước khi lưu.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveKey}
                  disabled={saving || !keyInput.trim()}
                  className="flex-1 text-xs bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button
                  onClick={() => setPendingProvider(null)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2"
                >
                  ←
                </button>
              </div>
            </div>
          ) : (
            <div className="py-1">
              {(Object.entries(PROVIDERS) as [ProviderId, typeof PROVIDERS[ProviderId]][]).map(([id, cfg]) => (
                <button
                  key={id}
                  onClick={() => handleSelectProvider(id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50"
                >
                  <span className={provider === id && mode === 'api' ? 'font-semibold' : ''}>{cfg.label}</span>
                  {savedKeys[id]
                    ? <span className="text-green-600 text-[10px]">●  key đã lưu</span>
                    : <span className="text-muted-foreground text-[10px]">nhập key</span>
                  }
                </button>
              ))}
              <div className="border-t my-1" />
              <button
                onClick={handleSelectSimulate}
                className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50"
              >
                <span className={mode === 'simulate' ? 'font-semibold' : ''}>Simulate</span>
                <span className="text-muted-foreground text-[10px]">không cần API key</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
