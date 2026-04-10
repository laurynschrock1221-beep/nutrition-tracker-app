'use client'

import React, { useEffect, useState, useRef, forwardRef } from 'react'
import { useParams } from 'next/navigation'
import { getProcessedStateById, saveProcessedState } from '@/lib/storage'
import { parseResume } from '@/lib/resume-parser'
import type { ProcessedState } from '@/lib/types'
import type { ParsedResume } from '@/lib/resume-parser'

export default function ResumePreviewPage() {
  const { id } = useParams<{ id: string }>()
  const [draft, setDraft] = useState<ProcessedState | null>(null)
  const [parsed, setParsed] = useState<ParsedResume | null>(null)
  const [editing, setEditing] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    getProcessedStateById(id).then((d) => {
      if (d) {
        setDraft(d)
        setEditText(d.resume_text ?? '')
        setParsed(parseResume(d.resume_text ?? ''))
      }
      setLoading(false)
    })
  }, [id])

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    try {
      const updated = { ...draft, resume_text: editText }
      await saveProcessedState(updated)
      setDraft(updated)
      setParsed(parseResume(editText))
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    )
  }

  if (!draft || !parsed) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <p className="text-slate-500 text-sm">Draft not found.</p>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          .resume-sheet {
            width: 8.5in !important;
            min-height: 11in !important;
            padding: 0.75in !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
        }
        @page { size: letter; margin: 0; }
      `}</style>

      {/* Toolbar */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-slate-700 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            ← Close
          </button>
          <div>
            <p className="text-white text-sm font-medium">{draft.title}</p>
            <p className="text-slate-400 text-xs">{draft.company}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => { setEditing(false); setEditText(draft.resume_text ?? '') }}
                className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="border border-slate-700 text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
              >
                {showRaw ? 'Preview' : 'Raw'}
              </button>
              <button
                onClick={() => setEditing(true)}
                className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
              >
                Edit Text
              </button>
              <button
                onClick={() => window.print()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
              >
                Save as PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Page body */}
      <div className="no-print pt-14 min-h-screen bg-slate-800 flex flex-col items-center py-8 px-2 overflow-x-auto">
        {editing ? (
          <div className="w-full max-w-3xl">
            <p className="text-slate-400 text-xs mb-2">
              Edit the plain-text resume. Click Save to update and re-render the preview.
            </p>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full h-[70vh] font-mono text-xs text-slate-200 bg-slate-900 border border-slate-600 rounded-xl p-4 resize-none focus:outline-none focus:border-indigo-500"
            />
          </div>
        ) : showRaw ? (
          <div className="w-full max-w-3xl">
            <p className="text-slate-400 text-xs mb-2">Raw AI output — use this to spot parsing issues.</p>
            <pre className="w-full font-mono text-xs text-slate-300 bg-slate-900 border border-slate-700 rounded-xl p-4 whitespace-pre-wrap overflow-auto h-[80vh]">
              {draft.resume_text}
            </pre>
          </div>
        ) : (
          <ResumeSheet parsed={parsed} ref={sheetRef} />
        )}
      </div>

      {/* Always-rendered sheet for print (hidden in browser, shown on print) */}
      <div className="hidden print:block">
        <ResumeSheet parsed={parsed} ref={null} />
      </div>
    </>
  )
}

/* ─── Resume Sheet ──────────────────────────────────────────────────── */

const ResumeSheet = forwardRef<HTMLDivElement, { parsed: ParsedResume }>(
  function ResumeSheet({ parsed }, ref) {
    return (
      <div
        ref={ref}
        className="resume-sheet bg-white text-black"
        style={{
          width: '8.5in',
          minHeight: '11in',
          padding: '0.8in 0.85in',
          fontFamily: 'Garamond, "EB Garamond", "Adobe Garamond Pro", Georgia, serif',
          fontSize: '10.5pt',
          lineHeight: '1.45',
          boxShadow: '0 4px 32px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '6pt' }}>
          <div style={{ fontSize: '16pt', fontWeight: 'bold', letterSpacing: '0.02em' }}>
            {parsed.header.name}
            {parsed.header.credentials && (
              <span style={{ fontWeight: 'normal', fontSize: '12.5pt' }}>
                , {parsed.header.credentials}
              </span>
            )}
          </div>
          <div style={{ fontSize: '9.5pt', color: '#333', marginTop: '3pt', letterSpacing: '0.01em' }}>
            <ContactLine text={parsed.header.contact} />
          </div>
        </div>

        <div style={{ margin: '0 0 8pt' }} />

        {/* Professional Summary */}
        {parsed.summary && (
          <>
            <SectionHeader title="PROFESSIONAL SUMMARY" />
            <p style={{ margin: '3pt 0 10pt', lineHeight: '1.5', fontSize: '10pt' }}>
              {parsed.summary}
            </p>
          </>
        )}

        {/* Core Competencies */}
        {parsed.competencies.length > 0 && (
          <>
            <SectionHeader title="CORE COMPETENCIES" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '3pt 20pt',
                margin: '3pt 0 10pt',
                fontSize: '10pt',
              }}
            >
              {parsed.competencies.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: '6pt' }}>
                  <span style={{ flexShrink: 0 }}>•</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Professional Experience */}
        {parsed.experience.length > 0 && (
          <>
            <SectionHeader title="PROFESSIONAL EXPERIENCE" />
            {parsed.experience.map((exp, i) => (
              <div key={i} style={{ marginBottom: '10pt' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10.5pt' }}>
                  {exp.company}
                  {exp.location && (
                    <span style={{ fontWeight: 'normal', fontSize: '9.5pt', color: '#444' }}>
                      {' '}— {exp.location}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3pt' }}>
                  <span style={{ fontStyle: 'italic', fontSize: '10pt', color: '#222' }}>
                    {exp.title}
                  </span>
                  {exp.dateRange && (
                    <span style={{ fontStyle: 'normal', color: '#555', fontSize: '9.5pt', flexShrink: 0, marginLeft: '12pt' }}>
                      {exp.dateRange}
                    </span>
                  )}
                </div>
                {exp.bullets.map((b, j) => (
                  <div key={j} style={{ display: 'flex', gap: '6pt', marginBottom: '2.5pt', fontSize: '10pt', lineHeight: '1.4' }}>
                    <span style={{ flexShrink: 0, marginTop: '1pt' }}>•</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* Education */}
        {(parsed.educationBlocks ?? []).length > 0 && (
          <>
            <SectionHeader title="EDUCATION" />
            <div style={{ margin: '3pt 0 10pt', fontSize: '10pt' }}>
              {(parsed.educationBlocks ?? []).map((block, i) => {
                const isCertBlock = /certif/i.test(block[0])
                const isInstitution = (l: string) =>
                  /university|college|seminary|institute|school/i.test(l)
                const visibleLines = isCertBlock
                  ? block.filter(l => !isInstitution(l))
                  : block
                return (
                  <div key={i} style={{ marginBottom: i < (parsed.educationBlocks ?? []).length - 1 ? '5pt' : '0' }}>
                    {visibleLines.map((line, j) => (
                      <div
                        key={j}
                        style={{
                          fontWeight: !isCertBlock && j === 0 ? 'bold' : 'normal',
                          fontStyle: !isCertBlock && j === 1 ? 'italic' : 'normal',
                          color: (!isCertBlock && j === 0) ? '#000' : '#444',
                          fontSize: (!isCertBlock && j === 0) ? '10.5pt' : '10pt',
                          paddingLeft: isCertBlock ? '12pt' : '0',
                          lineHeight: '1.4',
                        }}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Technical Tools */}
        {parsed.tools.length > 0 && (
          <>
            <SectionHeader title="TECHNICAL TOOLS" />
            <div style={{ fontSize: '10pt', marginTop: '3pt' }}>
              {parsed.tools.join(' | ')}
            </div>
          </>
        )}
      </div>
    )
  }
)

function ContactLine({ text }: { text: string }) {
  // Split on | or • separators
  const parts = text.split(/[|•]/).map(p => p.trim()).filter(Boolean)
  return (
    <>
      {parts.map((part, i) => {
        const isLinkedIn = /linkedin/i.test(part)
        const isUrl = /^https?:\/\//i.test(part)
        const isEmail = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(part)
        const isPhone = /\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]?\d{4}/.test(part)
        let node: React.ReactNode = part
        if (isLinkedIn) {
          const href = part.startsWith('http') ? part : `https://${part}`
          node = <a href={href} style={{ color: '#333', textDecoration: 'underline' }}>LinkedIn</a>
        } else if (isUrl) {
          node = <a href={part} style={{ color: '#333', textDecoration: 'underline' }}>{part}</a>
        } else if (isEmail) {
          const email = part.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] ?? part
          node = <a href={`mailto:${email}`} style={{ color: '#333', textDecoration: 'underline' }}>{part}</a>
        } else if (isPhone) {
          node = <a href={`tel:${part.replace(/\D/g, '')}`} style={{ color: '#333' }}>{part}</a>
        }
        return (
          <span key={i}>
            {i > 0 && <span style={{ margin: '0 4pt' }}>|</span>}
            {node}
          </span>
        )
      })}
    </>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '9.5pt',
        fontWeight: 'bold',
        letterSpacing: '0.09em',
        borderBottom: '1px solid #000',
        paddingBottom: '2pt',
        marginBottom: '5pt',
        marginTop: '2pt',
        color: '#111',
      }}
    >
      {title}
    </div>
  )
}
