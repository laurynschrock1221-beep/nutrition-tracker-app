'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSettings } from '@/lib/storage'

interface Headline {
  focus: string
  text: string
}

interface ExperienceEntry {
  company: string
  title: string
  bullets: string[]
}

interface LinkedInContent {
  headlines: Headline[]
  about: string
  experience: ExperienceEntry[]
}

export default function LinkedInPage() {
  const router = useRouter()
  const [hasMasterResume, setHasMasterResume] = useState<boolean | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [content, setContent] = useState<LinkedInContent | null>(null)

  // About edit state
  const [editingAbout, setEditingAbout] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    getSettings().then((s) => {
      setHasMasterResume(!!s.master_resume?.trim())
    })
  }, [])

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    try {
      const settings = await getSettings()
      const res = await fetch('/api/generate-linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_resume: settings.master_resume,
          fact_bank: settings.fact_bank,
        }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const data: LinkedInContent = await res.json()
      setContent(data)
      setAboutDraft(data.about)
      setEditingAbout(false)
    } catch {
      setError('Generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function handleSaveAbout() {
    if (!content) return
    setContent({ ...content, about: aboutDraft })
    setEditingAbout(false)
  }

  function startEditAbout() {
    setAboutDraft(content?.about ?? '')
    setEditingAbout(true)
  }

  // Loading check
  if (hasMasterResume === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    )
  }

  // No master resume
  if (!hasMasterResume) {
    return (
      <div className="px-4 pt-6 pb-4 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">LinkedIn Profile</h1>
        </div>
        <div className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 p-6 text-center space-y-3">
          <p className="text-slate-300 text-sm">No master resume found.</p>
          <p className="text-slate-500 text-xs">Add your master resume in Settings before generating LinkedIn content.</p>
          <button
            onClick={() => router.push('/settings')}
            className="mt-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all shadow-lg shadow-violet-900/40"
          >
            Go to Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">LinkedIn Profile</h1>
          {content && (
            <p className="text-slate-500 text-xs mt-0.5">Generated content ready to copy</p>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-violet-900/40"
        >
          {generating ? 'Generating...' : content ? '↺ Regenerate' : 'Generate'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3">
          <p className="text-rose-400 text-sm">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {generating && (
        <div className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 p-8 text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-slate-400 text-sm">Generating your LinkedIn profile content...</p>
          <p className="text-slate-600 text-xs">This may take 15–30 seconds</p>
        </div>
      )}

      {/* Generated content */}
      {content && !generating && (
        <div className="space-y-5">
          {/* Headlines */}
          <div className="space-y-3">
            <p className="text-slate-500 uppercase tracking-wider text-xs font-medium">Headlines</p>
            {content.headlines.map((headline, i) => {
              const charCount = headline.text.length
              const overLimit = charCount > 220
              return (
                <div
                  key={i}
                  className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-slate-500 uppercase tracking-wider text-xs font-medium">{headline.focus}</p>
                    <span className={`text-xs font-mono shrink-0 ${overLimit ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {charCount} / 220
                    </span>
                  </div>
                  <p className="text-white text-sm leading-relaxed">{headline.text}</p>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => copyText(headline.text, `headline-${i}`)}
                      className="bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {copiedKey === `headline-${i}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* About */}
          <div className="space-y-3">
            <p className="text-slate-500 uppercase tracking-wider text-xs font-medium">About Section</p>
            <div className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 p-4 space-y-3">
              {editingAbout ? (
                <>
                  <textarea
                    value={aboutDraft}
                    onChange={(e) => setAboutDraft(e.target.value)}
                    rows={12}
                    className="w-full bg-white/5 border border-white/10 focus:border-violet-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none resize-none leading-relaxed"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingAbout(false)}
                      className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveAbout}
                      className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-all"
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{content.about}</p>
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      onClick={startEditAbout}
                      className="bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => copyText(content.about, 'about')}
                      className="bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {copiedKey === 'about' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Experience */}
          <div className="space-y-3">
            <p className="text-slate-500 uppercase tracking-wider text-xs font-medium">Experience</p>
            {content.experience.map((job, i) => {
              const allBullets = job.bullets.join('\n• ')
              const copyAllText = `${job.title} at ${job.company}\n• ${allBullets}`
              return (
                <div
                  key={i}
                  className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-white font-medium text-sm">{job.company}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{job.title}</p>
                    </div>
                    <button
                      onClick={() => copyText(copyAllText, `job-${i}`)}
                      className="shrink-0 bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {copiedKey === `job-${i}` ? 'Copied!' : 'Copy All'}
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {job.bullets.map((bullet, j) => (
                      <li key={j} className="flex gap-2">
                        <span className="text-slate-500 shrink-0 mt-0.5">•</span>
                        <span className="text-slate-300 text-sm leading-relaxed">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!content && !generating && (
        <div className="text-center py-16 space-y-3">
          <p className="text-slate-500 text-sm">No LinkedIn content yet.</p>
          <p className="text-slate-600 text-xs">Tap Generate to create headlines, an about section, and experience bullets.</p>
        </div>
      )}
    </div>
  )
}
