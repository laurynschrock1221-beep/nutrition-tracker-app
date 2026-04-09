'use client'

import { useEffect, useState } from 'react'
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
  const [loading, setLoading] = useState(true)

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
    try {
      const existing = applications.find(
        (a) => a.role_key === draft.role_key || (a.company === draft.company && a.title === draft.title)
      )
      if (existing) return // already tracked
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
      setApplications((prev) => [...prev, { ...entry, user_id: '' }])
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
          <p className="text-slate-600 text-xs mt-1">
            Paste a job description in the Manual tab to generate your first draft.
          </p>
        </div>
      ) : selected ? (
        /* Draft detail view */
        <div className="space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"
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

          <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 space-y-3">
            <div>
              <p className="text-white font-medium">{selected.title}</p>
              <p className="text-slate-400 text-sm">{selected.company}</p>
              {selected.location && (
                <p className="text-slate-500 text-xs">{selected.location}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3 text-xs items-center">
              {selected.match_pct !== undefined && (
                <span className="text-emerald-400 font-medium">{selected.match_pct}% match</span>
              )}
              <span className="text-slate-500">{selected.last_seen}</span>
              {selected.is_manual && (
                <span className="text-indigo-400 border border-indigo-500/40 px-1.5 py-0.5 rounded-full">
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

            {selected.integrity_notes && (
              <div className="rounded-lg bg-slate-900 px-3 py-2">
                <p className="text-xs text-slate-400">{selected.integrity_notes}</p>
              </div>
            )}

            {/* Tab switcher */}
            <div className="flex rounded-lg bg-slate-900 p-1 gap-1">
              <button
                onClick={() => setActiveTab('resume')}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${activeTab === 'resume' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Resume
              </button>
              <button
                onClick={() => setActiveTab('cover_letter')}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${activeTab === 'cover_letter' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Cover Letter {selected.cover_letter_text ? '' : '(not yet generated)'}
              </button>
            </div>

            <div className="flex gap-2">
              {activeTab === 'resume' ? (
                <>
                  <button
                    onClick={() => window.open(`/resume-preview/${selected.id}`, '_blank')}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                  >
                    Preview &amp; Export PDF
                  </button>
                  <button
                    onClick={() => handleCopy(selected.resume_text ?? '')}
                    className="px-3 py-2.5 rounded-lg border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white text-sm transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </>
              ) : selected.cover_letter_text ? (
                <>
                  <button
                    onClick={() => window.open(`/cover-letter-preview/${selected.id}`, '_blank')}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                  >
                    Preview &amp; Export PDF
                  </button>
                  <button
                    onClick={() => handleCopyCL(selected.cover_letter_text ?? '')}
                    className="px-3 py-2.5 rounded-lg border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white text-sm transition-colors"
                  >
                    {copiedCL ? 'Copied!' : 'Copy'}
                  </button>
                </>

              ) : (
                <button
                  onClick={() => handleGenerateCoverLetter(selected)}
                  disabled={generatingCL}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                >
                  {generatingCL ? 'Generating...' : 'Generate Cover Letter'}
                </button>
              )}
              {clError && <p className="text-red-400 text-xs mt-1">{clError}</p>}
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-2.5 rounded-lg border border-red-500/30 text-red-400 hover:text-red-300 text-sm transition-colors"
                >
                  Delete
                </button>
              ) : (
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="px-3 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
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
            <div className="rounded-xl bg-slate-900 border border-slate-700 p-4">
              <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wide">Resume Preview</p>
              <pre className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap font-mono overflow-auto max-h-[60vh]">
                {selected.resume_text}
              </pre>
            </div>
          )}
          {activeTab === 'cover_letter' && selected.cover_letter_text && (
            <div className="rounded-xl bg-slate-900 border border-slate-700 p-4">
              <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wide">Cover Letter Preview</p>
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                {selected.cover_letter_text}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Draft list */
        <div className="space-y-2">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3 flex items-center gap-3"
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
                    <span className="text-[10px] text-indigo-400 border border-indigo-500/40 px-1.5 py-0.5 rounded-full">
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
                    className="text-xs bg-red-600 hover:bg-red-500 text-white px-2.5 py-1.5 rounded-lg transition-colors"
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
                  className="shrink-0 text-slate-600 hover:text-red-400 transition-colors p-1"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
