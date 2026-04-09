'use client'

import { useEffect, useState } from 'react'
import {
  getManualRoles,
  getPendingManualRoles,
  getSettings,
  saveManualRole,
  updateManualRoleStatus,
  deleteManualRole,
  saveProcessedState,
  incrementDailyCount,
  generateId,
  todayDate,
} from '@/lib/storage'
import { makeRoleKey, syntheticManualUrl } from '@/lib/dedup'
import type { ManualRole, UserSettings } from '@/lib/types'

type ProcessingState = 'idle' | 'scoring' | 'generating' | 'done' | 'error'

interface QueueItem {
  id: string
  company: string
  title: string
  location: string
  jdText: string
  status: 'pending' | 'processing' | 'done' | 'error'
  matchPct?: number
}

export default function ManualPage() {
  const [roles, setRoles] = useState<ManualRole[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [company, setCompany] = useState('')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [jdText, setJdText] = useState('')
  const [url, setUrl] = useState('')
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [processing, setProcessing] = useState<ProcessingState>('idle')
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [generatingAll, setGeneratingAll] = useState(false)
  const [generatingAllStatus, setGeneratingAllStatus] = useState('')

  useEffect(() => {
    async function load() {
      const [r, s] = await Promise.all([getManualRoles(), getSettings()])
      setRoles(r)
      setSettings(s)
      setLoading(false)
    }
    load()
  }, [])

  // ── URL fetch ────────────────────────────────────────────────────────────────

  async function handleUrlBlur() {
    if (!url.trim()) return
    setFetchingUrl(true)
    setFetchError('')
    try {
      const jinaUrl = `https://r.jina.ai/${url.trim()}`
      const res = await fetch(jinaUrl, {
        headers: { Accept: 'text/plain' },
      })
      if (!res.ok) throw new Error('Fetch failed')
      const text = await res.text()
      if (!text?.trim()) throw new Error('Empty response')
      setJdText(text.trim())
      // Auto-extract metadata from the fetched text
      await extractMetadata(text.trim())
    } catch {
      setFetchError("Couldn't retrieve this page automatically — paste the JD text below.")
    } finally {
      setFetchingUrl(false)
    }
  }

  // ── Metadata extraction ───────────────────────────────────────────────────

  async function extractMetadata(text: string) {
    setExtracting(true)
    try {
      const res = await fetch('/api/extract-jd-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_text: text }),
      })
      const data = await res.json()
      if (data.company) setCompany(data.company)
      if (data.title) setTitle(data.title)
      if (data.location) setLocation(data.location)
    } catch {
      // silent
    } finally {
      setExtracting(false)
    }
  }

  async function handleJdBlur() {
    if (!jdText.trim()) return
    await extractMetadata(jdText)
  }

  // ── Single generate ───────────────────────────────────────────────────────

  async function runGenerate(role: ManualRole, s: UserSettings): Promise<void> {
    const now = new Date().toISOString()
    const synUrl = syntheticManualUrl(role.company, role.title, now)
    const role_key = makeRoleKey(role.company, role.title, synUrl)

    const res = await fetch('/api/manual-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jd_text: role.jd_text,
        company: role.company,
        title: role.title,
        location: role.location,
        master_resume: s.master_resume,
        fact_bank: s.fact_bank,
        role_key,
      }),
    })

    if (!res.ok) throw new Error('Pipeline failed')

    const { score_result, generate_result } = await res.json()
    const today = todayDate()

    await saveProcessedState({
      id: generateId(),
      role_key,
      status: 'generated',
      source: 'manual',
      company: role.company,
      title: role.title,
      location: role.location,
      jd_text: role.jd_text,
      match: score_result.should_generate,
      match_pct: score_result.match_pct,
      resume_text: generate_result.resume_text,
      output_file: generate_result.output_file,
      integrity_notes: generate_result.integrity_notes,
      last_seen: today,
      today: true,
      is_manual: true,
      created_at: now,
      updated_at: new Date().toISOString(),
    })

    await incrementDailyCount(today, 'generated_count')
    await updateManualRoleStatus(role.id, 'generated', {
      processed_at: new Date().toISOString(),
    })

    return score_result.match_pct
  }

  async function handleSubmit() {
    if (!jdText.trim()) {
      setError('Job description is required.')
      return
    }
    if (!settings?.master_resume?.trim()) {
      setError('Master resume not set up. Go to Settings first.')
      return
    }

    setError('')
    const now = new Date().toISOString()
    const newRole: Omit<ManualRole, 'user_id'> = {
      id: generateId(),
      company: company.trim() || 'Unknown Company',
      title: title.trim() || 'Unknown Title',
      location: location.trim() || undefined,
      jd_text: jdText.trim(),
      status: 'processing',
      role_key: makeRoleKey(company || 'Unknown', title || 'Unknown'),
      created_at: now,
    }

    const saved = await saveManualRole(newRole)
    setRoles((prev) => [saved, ...prev])
    setActiveRoleId(saved.id)
    setProcessing('scoring')
    setCompany(''); setTitle(''); setLocation(''); setJdText(''); setUrl('')

    try {
      setProcessing('generating')
      await runGenerate(saved, settings)
      setRoles((prev) => prev.map((r) => r.id === saved.id ? { ...r, status: 'generated' } : r))
      setProcessing('done')
      setExpandedId(saved.id)
    } catch {
      await updateManualRoleStatus(saved.id, 'failed', { error_msg: 'Pipeline failed.' })
      setRoles((prev) => prev.map((r) => r.id === saved.id ? { ...r, status: 'failed' } : r))
      setProcessing('error')
      setError('Generation failed. Make sure your API key is configured.')
    } finally {
      setActiveRoleId(null)
    }
  }

  // ── Queue ─────────────────────────────────────────────────────────────────

  function handleAddToQueue() {
    if (!jdText.trim()) {
      setError('Job description is required to add to queue.')
      return
    }
    setError('')
    const item: QueueItem = {
      id: generateId(),
      company: company.trim() || 'Unknown Company',
      title: title.trim() || 'Unknown Title',
      location: location.trim(),
      jdText: jdText.trim(),
      status: 'pending',
    }
    setQueue((prev) => [...prev, item])
    setCompany(''); setTitle(''); setLocation(''); setJdText(''); setUrl('')
  }

  function handleRemoveFromQueue(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id))
  }

  async function handleGenerateAll() {
    if (!settings?.master_resume?.trim()) {
      setError('Master resume not set up. Go to Settings first.')
      return
    }
    if (queue.length === 0) return
    setGeneratingAll(true)
    setError('')

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      setGeneratingAllStatus(`Generating ${i + 1} of ${queue.length}: ${item.title} at ${item.company}`)
      setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'processing' } : q))

      try {
        const now = new Date().toISOString()
        const saved = await saveManualRole({
          id: generateId(),
          company: item.company,
          title: item.title,
          location: item.location || undefined,
          jd_text: item.jdText,
          status: 'processing',
          role_key: makeRoleKey(item.company, item.title),
          created_at: now,
        })
        setRoles((prev) => [saved, ...prev])

        const matchPct = await runGenerate(saved, settings)
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'done', matchPct } : q))
        setRoles((prev) => prev.map((r) => r.id === saved.id ? { ...r, status: 'generated' } : r))
      } catch {
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'error' } : q))
      }
    }

    setGeneratingAll(false)
    setGeneratingAllStatus('')
  }

  async function handleDelete(id: string) {
    await deleteManualRole(id)
    setRoles((prev) => prev.filter((r) => r.id !== id))
  }

  const noResume = !settings?.master_resume?.trim()
  const isProcessing = processing === 'scoring' || processing === 'generating'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Manual Role Input</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Paste a JD or drop a URL — company, title, and location fill in automatically.
        </p>
      </div>

      {noResume && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3">
          <p className="text-amber-400 text-sm font-medium">Master resume required</p>
          <p className="text-amber-400/70 text-xs mt-0.5">
            Go to Settings and paste your resume before generating.
          </p>
        </div>
      )}

      {/* Input form */}
      <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 space-y-3">

        {/* URL field */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-400">Job URL (optional)</label>
            {fetchingUrl && (
              <span className="text-xs text-indigo-400 flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Fetching...
              </span>
            )}
          </div>
          <input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setFetchError('') }}
            onBlur={handleUrlBlur}
            placeholder="Paste a job posting URL — works for most boards except LinkedIn"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
          {fetchError && <p className="text-amber-400 text-xs mt-1">{fetchError}</p>}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-xs text-slate-600">or paste JD below</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        {/* Metadata fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Company</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Auto-detected"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-detected"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Auto-detected"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-400">Job Description</label>
            {extracting && (
              <span className="text-xs text-indigo-400 flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Extracting details...
              </span>
            )}
          </div>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            onBlur={handleJdBlur}
            placeholder="Paste the full job description here..."
            rows={8}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none font-mono"
          />
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleAddToQueue}
            disabled={isProcessing || generatingAll || noResume}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Add to Queue
          </button>
          <button
            onClick={handleSubmit}
            disabled={isProcessing || generatingAll || noResume}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {processing === 'scoring' ? 'Scoring...' : processing === 'generating' ? 'Generating...' : 'Generate Now'}
          </button>
        </div>
      </div>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-indigo-300 text-sm">
            {processing === 'scoring' ? 'Scoring role against your resume...' : 'Generating tailored draft...'}
          </p>
        </div>
      )}

      {/* Queue */}
      {queue.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-slate-400">Queue ({queue.length})</h2>
            <button
              onClick={handleGenerateAll}
              disabled={generatingAll || isProcessing || noResume}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              {generatingAll ? 'Generating...' : `Generate All ${queue.length}`}
            </button>
          </div>

          {generatingAllStatus && (
            <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3 flex items-center gap-3 mb-2">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-indigo-300 text-xs">{generatingAllStatus}</p>
            </div>
          )}

          <div className="space-y-2">
            {queue.map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{item.title}</p>
                  <p className="text-slate-400 text-xs">{item.company}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.status === 'processing' && (
                    <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {item.status === 'done' && (
                    <span className="text-xs text-emerald-400">{item.matchPct}%</span>
                  )}
                  {item.status === 'error' && (
                    <span className="text-xs text-red-400">failed</span>
                  )}
                  {item.status === 'pending' && (
                    <button
                      onClick={() => handleRemoveFromQueue(item.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previous manual roles */}
      {roles.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-400 mb-2">History</h2>
          <div className="space-y-2">
            {roles.map((role) => (
              <ManualRoleCard
                key={role.id}
                role={role}
                expanded={expandedId === role.id}
                onToggle={() => setExpandedId(expandedId === role.id ? null : role.id)}
                onDelete={() => handleDelete(role.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ManualRoleCard({
  role,
  expanded,
  onToggle,
  onDelete,
}: {
  role: ManualRole
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const statusColors: Record<string, string> = {
    pending: 'text-yellow-400',
    processing: 'text-blue-400',
    generated: 'text-emerald-400',
    failed: 'text-red-400',
  }

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium truncate">{role.title}</p>
          <p className="text-slate-400 text-xs">{role.company}</p>
        </div>
        <span className={`ml-3 text-xs font-medium shrink-0 ${statusColors[role.status]}`}>
          {role.status}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700 pt-3 space-y-3">
          {role.location && <p className="text-slate-400 text-xs">{role.location}</p>}
          {role.error_msg && <p className="text-red-400 text-xs">{role.error_msg}</p>}
          <p className="text-slate-500 text-xs">
            Submitted {new Date(role.created_at).toLocaleString()}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              Delete
            </button>
            {role.status === 'generated' && (
              <a
                href="/drafts"
                className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                View Draft
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
