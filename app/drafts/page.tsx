'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getProcessedStatesByStatus,
  deleteProcessedState,
  getSettings,
  saveProcessedState,
  getApplications,
  saveApplication,
  generateId,
  todayDate,
} from '@/lib/storage'
import type { ProcessedState, ApplicationEntry } from '@/lib/types'

export default function DraftsPage() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<ProcessedState[]>([])
  const [applications, setApplications] = useState<ApplicationEntry[]>([])
  const [selected, setSelected] = useState<ProcessedState | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedCL, setCopiedCL] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [generatingCL, setGeneratingCL] = useState(false)
  const [clError, setClError] = useState('')
  const [activeTab, setActiveTab] = useState<'resume' | 'cover_letter'>('resume')
  const [markingApplied, setMarkingApplied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      getProcessedStatesByStatus('generated'),
      getApplications(),
    ]).then(([d, a]) => {
      setDrafts(d)
      setApplications(a)
      setLoading(false)
    })
  }, [])

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDelete(id: string) {
    await deleteProcessedState(id)
    setDrafts((prev) => prev.filter((d) => d.id !== id))
    setSelected(null)
    setConfirmDelete(false)
  }

  function handleCopyCL(text: string) {
    navigator.clipboard.writeText(text)
    setCopiedCL(true)
    setTimeout(() => setCopiedCL(false), 2000)
  }

  function isApplied(draft: ProcessedState): boolean {
    return applications.some(
      (a) =>
        a.role_key === draft.role_key ||
        (a.company === draft.company && a.title === draft.title)
    )
  }

  async function handleMarkApplied(draft: ProcessedState) {
    setMarkingApplied(true)
    setRegenError('')
    try {
      const existing = applications.find(
        (a) => a.role_key === draft.role_key || (a.company === draft.company && a.title === draft.title)
      )
      if (existing) {
        router.push('/tracker')
        return
      }
      const now = new Date().toISOString()
      const entry: Omit<ApplicationEntry, 'user_id'> = {
        id: generateId(),
        company: draft.company,
        title: draft.title,
        status: 'applied',
        applied_date: todayDate(),
        role_key: draft.role_key,
        created_at: now,
        updated_at: now,
      }
      await saveApplication(entry)
      router.push('/tracker')
    } catch (err) {
      setRegenError('Failed to save application. Please try again.')
      console.error('handleMarkApplied error:', err)
    } finally {
      setMarkingApplied(false)
    }
  }

  async function handleGenerateCoverLetter(draft: ProcessedState) {
    setGeneratingCL(true)
    setClError('')
    try {
      const settings = await getSettings()
      const res = await fetch('/api/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd_text: draft.jd_text ?? '',
          master_resume: settings.master_resume,
          fact_bank: settings.fact_bank,
          resume_text: draft.resume_text,
          company: draft.company,
          title: draft.title,
          location: draft.location,
        }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const { cover_letter_text } = await res.json()

      await saveProcessedState({ ...draft, cover_letter_text })
      setDrafts((prev) =>
        prev.map((d) => (d.id === draft.id ? { ...d, cover_letter_text } : d))
      )
      setSelected((prev) => prev ? { ...prev, cover_letter_text } : prev)
      setActiveTab('cover_letter')
    } catch {
      setClError('Cover letter generation failed. Try again.')
    } finally {
      setGeneratingCL(false)
    }
  }

  async function handleRegenerate(draft: ProcessedState) {
    setRegenerating(true)
    setRegenError('')
    try {
      const settings = await getSettings()
      const res = await fetch('/api/manual-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd_text: draft.jd_text ?? '',
          company: draft.company,
          title: draft.title,
          location: draft.location,
          master_resume: settings.master_resume,
          fact_bank: settings.fact_bank,
          role_key: draft.role_key,
        }),
      })
      if (!res.ok) throw new Error('Regeneration failed')
      const { score_result, generate_result } = await res.json()
      const updated: ProcessedState = {
        ...draft,
        resume_text: generate_result.resume_text,
        output_file: generate_result.output_file,
        integrity_notes: generate_result.integrity_notes,
        match_pct: score_result.match_pct,
        strengths: score_result.strengths,
        gaps: score_result.gaps,
        cover_letter_text: undefined,
        updated_at: new Date().toISOString(),
      }
      await saveProcessedState(updated)
      setDrafts((prev) => prev.map((d) => d.id === draft.id ? updated : d))
      setSelected(updated)
      setActiveTab('resume')
    } catch {
      setRegenError('Regeneration failed. Try again.')
    } finally {
      setRegenerating(false)
    }
  }

  const filteredDrafts = search.trim()
    ? drafts.filter(
        (d) =>
          d.company.toLowerCase().includes(search.toLowerCase()) ||
          d.title.toLowerCase().includes(search.toLowerCase())
      )
    : drafts

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Generated Drafts</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {drafts.length} draft{drafts.length !== 1 ? 's' : ''} generated
        </p>
      </div>

      {drafts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm">No drafts yet.</p>
          <p className="text-slate-500 text-xs mt-1">
            Paste a job description in the Manual tab to generate your first draft.
          </p>
        </div>
      ) : selected ? (
        /* Draft detail view */
        <div className="space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path
                fillRule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Back to list
          </button>

          <div className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 p-4 space-y-3">
            <div>
              <p className="text-white font-medium">{selected.title}</p>
              <p className="text-slate-400 text-sm">{selected.company}</p>
              {selected.location && (
                <p className="text-slate-500 text-xs">{selected.location}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3 text-xs items-center">
              {selected.match_pct !== undefined && (
                <span className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full font-medium">{selected.match_pct}% match</span>
              )}
              <span className="text-slate-500">{selected.last_seen}</span>
              {selected.is_manual && (
                <span className="text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded-full">
                  manual
                </span>
              )}
              {isApplied(selected) && (
                <span className="text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded-full">
                  applied
                </span>
              )}
            </div>

            {!isApplied(selected) && (
              <button
                onClick={() => handleMarkApplied(selected)}
                disabled={markingApplied}
                className="w-full border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-400 text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {markingApplied ? 'Marking...' : 'Mark as Applied'}
              </button>
            )}

            <button
              onClick={() => handleRegenerate(selected)}
              disabled={regenerating}
              className="w-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {regenerating ? 'Regenerating...' : '↺ Regenerate Resume'}
            </button>
            {regenError && <p className="text-rose-400 text-xs">{regenError}</p>}

            {/* Strengths & Gaps */}
            {(selected.strengths?.length || selected.gaps?.length) ? (
              <div className="grid grid-cols-2 gap-2">
                {selected.strengths?.length ? (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5">
                    <p className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider mb-1.5">Strengths</p>
                    {selected.strengths.map((s, i) => (
                      <p key={i} className="text-xs text-emerald-300/80 leading-snug mb-1">• {s}</p>
                    ))}
                  </div>
                ) : null}
                {selected.gaps?.length ? (
                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2.5">
                    <p className="text-[10px] font-medium text-rose-400 uppercase tracking-wider mb-1.5">Gaps</p>
                    {selected.gaps.map((g, i) => (
                      <p key={i} className="text-xs text-rose-300/80 leading-snug mb-1">• {g}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {selected.integrity_notes && (
              <div className="rounded-lg bg-white/5 px-3 py-2">
                <p className="text-xs text-slate-400">{selected.integrity_notes}</p>
              </div>
            )}

            {/* Tab switcher */}
            <div className="flex rounded-lg bg-white/5 p-1 gap-1">
              <button
                onClick={() => setActiveTab('resume')}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${activeTab === 'resume' ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Resume
              </button>
              <button
                onClick={() => setActiveTab('cover_letter')}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${activeTab === 'cover_letter' ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Cover Letter {selected.cover_letter_text ? '' : '(not yet generated)'}
              </button>
            </div>

            <div className="flex gap-2">
              {activeTab === 'resume' ? (
                <>
                  <button
                    onClick={() => window.open(`/resume-preview/${selected.id}`, '_blank')}
                    className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-violet-900/40"
                  >
                    Preview &amp; Export PDF
                  </button>
                  <button
                    onClick={() => handleCopy(selected.resume_text ?? '')}
                    className="px-3 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </>
              ) : selected.cover_letter_text ? (
                <>
                  <button
                    onClick={() => window.open(`/cover-letter-preview/${selected.id}`, '_blank')}
                    className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-violet-900/40"
                  >
                    Preview &amp; Export PDF
                  </button>
                  <button
                    onClick={() => handleCopyCL(selected.cover_letter_text ?? '')}
                    className="px-3 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm transition-colors"
                  >
                    {copiedCL ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => handleGenerateCoverLetter(selected)}
                    disabled={generatingCL}
                    className="px-3 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm transition-colors disabled:opacity-50"
                    title="Regenerate Cover Letter"
                  >
                    {generatingCL ? '...' : '↺'}
                  </button>
                </>

              ) : (
                <button
                  onClick={() => handleGenerateCoverLetter(selected)}
                  disabled={generatingCL}
                  className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-violet-900/40"
                >
                  {generatingCL ? 'Generating...' : 'Generate Cover Letter'}
                </button>
              )}
              {clError && <p className="text-rose-400 text-xs mt-1">{clError}</p>}
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-2.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-400 text-sm transition-colors"
                >
                  Delete
                </button>
              ) : (
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="px-3 py-2.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-400 text-sm font-medium transition-colors"
                >
                  Confirm
                </button>
              )}
            </div>

            <p className="text-slate-500 text-xs">
              File: {selected.output_file}
            </p>
          </div>

          {/* Content preview */}
          {activeTab === 'resume' && selected.resume_text && (
            <div className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 p-4">
              <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wider">Resume Preview</p>
              <pre className="text-slate-400 text-xs leading-relaxed whitespace-pre-wrap font-mono overflow-auto max-h-[60vh]">
                {selected.resume_text}
              </pre>
            </div>
          )}
          {activeTab === 'cover_letter' && selected.cover_letter_text && (
            <div className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 p-4">
              <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wider">Cover Letter Preview</p>
              <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
                {selected.cover_letter_text}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Draft list */
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company or title..."
              className="w-full bg-white/5 border border-white/10 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none pr-8"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                aria-label="Clear search"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
          <div className="space-y-2">
          {filteredDrafts.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">No drafts match your search.</p>
          )}
          {filteredDrafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 px-4 py-3 flex items-center gap-3"
            >
              <button
                onClick={() => setSelected(draft)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="text-white text-sm font-medium truncate">{draft.title}</p>
                <p className="text-slate-400 text-xs truncate">{draft.company}</p>
                <div className="flex items-center gap-2 mt-1">
                  {draft.match_pct !== undefined && (
                    <span className="text-emerald-400 text-xs font-medium">{draft.match_pct}%</span>
                  )}
                  <span className="text-slate-500 text-[10px]">{draft.last_seen}</span>
                  {draft.is_manual && (
                    <span className="text-[10px] text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded-full">
                      manual
                    </span>
                  )}
                  {isApplied(draft) && (
                    <span className="text-[10px] text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded-full">
                      applied
                    </span>
                  )}
                </div>
              </button>

              {confirmDeleteId === draft.id ? (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleDelete(draft.id)}
                    className="text-xs bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-400 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1.5 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(draft.id)}
                  className="shrink-0 text-slate-500 hover:text-rose-400 transition-colors p-1"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}
