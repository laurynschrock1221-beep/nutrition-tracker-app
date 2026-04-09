'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSettings, saveSettings } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import type { UserSettings } from '@/lib/types'

export default function SettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<Partial<UserSettings>>({
    master_resume: '',
    fact_bank: '',
    daily_cap: 5,
    match_threshold: 55,
    target_titles: [],
    target_locations: [],
    excluded_terms: [],
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)

  // Resume Vault
  const [vaultText, setVaultText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [extractResult, setExtractResult] = useState<string | null>(null)
  const [extractError, setExtractError] = useState('')

  // Local string state for comma-separated list fields
  const [targetTitles, setTargetTitles] = useState('')
  const [targetLocations, setTargetLocations] = useState('')
  const [excludedTerms, setExcludedTerms] = useState('')

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      setTargetTitles((s.target_titles ?? []).join(', '))
      setTargetLocations((s.target_locations ?? []).join(', '))
      setExcludedTerms((s.excluded_terms ?? []).join(', '))
      setLoading(false)
    })
  }, [])

  function parseList(val: string): string[] {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      await saveSettings({
        ...settings,
        target_titles: parseList(targetTitles),
        target_locations: parseList(targetLocations),
        excluded_terms: parseList(excludedTerms),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      setSaveError(msg || 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setParsing(true)
    setExtractError('')
    setExtractResult(null)
    try {
      const texts = await Promise.all(files.map(async (file) => {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/parse-document', { method: 'POST', body: form })
        if (!res.ok) {
          const { error } = await res.json()
          throw new Error(`${file.name}: ${error ?? 'Parse failed'}`)
        }
        const { text } = await res.json()
        return `--- ${file.name} ---\n${text}`
      }))
      setVaultText(texts.join('\n\n'))
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Failed to parse one or more files.')
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  async function handleExtractFacts() {
    if (!vaultText.trim()) return
    setExtracting(true)
    setExtractResult(null)
    setExtractError('')
    try {
      const res = await fetch('/api/extract-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_resume: vaultText,
          master_resume: settings.master_resume ?? '',
          fact_bank: settings.fact_bank ?? '',
        }),
      })
      if (!res.ok) throw new Error('Extraction failed')
      const { extracted } = await res.json()

      if (extracted && extracted !== 'No new facts found.') {
        const separator = settings.fact_bank?.trim()
          ? '\n\n— Extracted from older resume —\n'
          : '— Extracted from older resume —\n'
        const updated = (settings.fact_bank ?? '') + separator + extracted
        setSettings(s => ({ ...s, fact_bank: updated }))
        setExtractResult(extracted)
        setVaultText('')
      } else {
        setExtractResult('No new facts found — your master resume already covers this.')
      }
    } catch {
      setExtractError('Extraction failed. Try again.')
    } finally {
      setExtracting(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/auth')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Configure your resume and generation preferences.</p>
      </div>

      {/* Master Resume */}
      <Section title="Master Resume" description="Your base resume. All tailored drafts are generated from this.">
        <textarea
          value={settings.master_resume ?? ''}
          onChange={(e) => setSettings((s) => ({ ...s, master_resume: e.target.value }))}
          placeholder="Paste your full resume here (plain text)..."
          rows={14}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none font-mono"
        />
        {!settings.master_resume?.trim() && (
          <p className="text-amber-400 text-xs mt-1">Required — needed for scoring and generation.</p>
        )}
      </Section>

      {/* Fact Bank */}
      <Section
        title="Fact Bank"
        description="Additional context the AI can draw from: achievements, projects, metrics, and skills not in your resume."
      >
        <textarea
          value={settings.fact_bank ?? ''}
          onChange={(e) => setSettings((s) => ({ ...s, fact_bank: e.target.value }))}
          placeholder="e.g. Led Salesforce migration for 200-person org. Reduced contract cycle time by 40%..."
          rows={6}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
        />
      </Section>

      {/* Resume Vault */}
      <Section
        title="Resume Vault"
        description="Upload or paste an older resume to extract any new facts, achievements, or skills not already in your master resume. Anything new gets added to your Fact Bank automatically."
      >
        {/* File upload */}
        <label className={`flex items-center justify-center gap-2 w-full border border-dashed rounded-lg py-3 text-sm transition-colors cursor-pointer ${parsing ? 'border-slate-600 text-slate-500' : 'border-slate-600 hover:border-indigo-500/60 text-slate-400 hover:text-indigo-400'}`}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          {parsing ? 'Parsing files...' : 'Upload PDF or Word files (select multiple)'}
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            multiple
            onChange={handleFileUpload}
            disabled={parsing}
            className="hidden"
          />
        </label>

        <div className="flex items-center gap-2">
          <div className="flex-1 border-t border-slate-700" />
          <span className="text-slate-600 text-xs">or paste text</span>
          <div className="flex-1 border-t border-slate-700" />
        </div>

        <textarea
          value={vaultText}
          onChange={(e) => { setVaultText(e.target.value); setExtractResult(null) }}
          placeholder="Paste an older resume here (plain text)..."
          rows={8}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none font-mono"
        />
        <button
          onClick={handleExtractFacts}
          disabled={extracting || parsing || !vaultText.trim()}
          className="w-full border border-indigo-500/50 hover:bg-indigo-500/10 disabled:opacity-40 text-indigo-400 text-sm font-medium py-2.5 rounded-lg transition-colors"
        >
          {extracting ? 'Extracting new facts...' : 'Extract & Add to Fact Bank'}
        </button>
        {extractResult && (
          <div className={`rounded-lg px-3 py-2.5 text-xs ${extractResult.startsWith('No new') ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'}`}>
            {extractResult.startsWith('No new') ? extractResult : (
              <>
                <p className="font-medium mb-1.5">Added to your Fact Bank:</p>
                <pre className="whitespace-pre-wrap font-sans">{extractResult}</pre>
                <p className="text-emerald-400/70 mt-1.5">Hit Save Settings to persist.</p>
              </>
            )}
          </div>
        )}
        {extractError && (
          <p className="text-red-400 text-xs">{extractError}</p>
        )}
      </Section>

      {/* Generation settings */}
      <Section title="Generation Settings" description="Controls for automated pipeline behavior.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Daily cap</label>
            <input
              type="number"
              min={1}
              max={20}
              value={settings.daily_cap ?? 5}
              onChange={(e) =>
                setSettings((s) => ({ ...s, daily_cap: parseInt(e.target.value) || 5 }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="text-slate-600 text-[10px] mt-1">Max resumes per day</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Match threshold</label>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.match_threshold ?? 55}
              onChange={(e) =>
                setSettings((s) => ({ ...s, match_threshold: parseInt(e.target.value) || 55 }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="text-slate-600 text-[10px] mt-1">Min AI score (0–100)</p>
          </div>
        </div>
      </Section>

      {/* Targeting */}
      <Section
        title="Targeting (Optional)"
        description="Used by automated scout to pre-filter roles. Leave blank to disable filtering."
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Target titles</label>
            <input
              value={targetTitles}
              onChange={(e) => setTargetTitles(e.target.value)}
              placeholder="Program Manager, Operations Manager, RevOps..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Target locations</label>
            <input
              value={targetLocations}
              onChange={(e) => setTargetLocations(e.target.value)}
              placeholder="Remote, Denver CO, Hybrid..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Excluded terms</label>
            <input
              value={excludedTerms}
              onChange={(e) => setExcludedTerms(e.target.value)}
              placeholder="engineer, developer, attorney..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </Section>

      {saveError && (
        <p className="text-red-400 text-xs rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          {saveError}
        </p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-3 rounded-lg transition-colors"
      >
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>

      {/* Sign out */}
      <div className="border-t border-slate-800 pt-4">
        <button
          onClick={handleSignOut}
          className="w-full text-slate-500 hover:text-red-400 text-sm py-2 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        {description && <p className="text-slate-500 text-xs mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}
