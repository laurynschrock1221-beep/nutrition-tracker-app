'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getProcessedStateById, saveProcessedState } from '@/lib/storage'
import type { ProcessedState } from '@/lib/types'

export default function CoverLetterPreviewPage() {
  const { id } = useParams<{ id: string }>()
  const [draft, setDraft] = useState<ProcessedState | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getProcessedStateById(id).then((d) => {
      if (d) {
        setDraft(d)
        setEditText(d.cover_letter_text ?? '')
      }
      setLoading(false)
    })
  }, [id])

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    try {
      const updated = { ...draft, cover_letter_text: editText }
      await saveProcessedState(updated)
      setDraft(updated)
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

  if (!draft?.cover_letter_text) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <p className="text-slate-500 text-sm">Cover letter not found.</p>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          .cl-sheet {
            width: 8.5in !important;
            min-height: 11in !important;
            padding: 1in !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
        }
        @page { size: letter; margin: 0; }
      `}</style>

      {/* Toolbar */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-slate-700 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.close()} className="text-slate-400 hover:text-white text-sm transition-colors">
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
                onClick={() => { setEditing(false); setEditText(draft.cover_letter_text ?? '') }}
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
                onClick={() => setEditing(true)}
                className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
              >
                Edit
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
      <div className="no-print pt-14 min-h-screen bg-slate-800 flex flex-col items-center py-8 px-4">
        {editing ? (
          <div className="w-full max-w-3xl">
            <p className="text-slate-400 text-xs mb-2">Edit the cover letter text. Click Save to update the preview.</p>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full h-[75vh] font-mono text-xs text-slate-200 bg-slate-900 border border-slate-600 rounded-xl p-4 resize-none focus:outline-none focus:border-indigo-500"
            />
          </div>
        ) : (
          <CoverLetterSheet text={draft.cover_letter_text ?? ''} />
        )}
      </div>

      {/* Print-only sheet */}
      <div className="hidden print:block">
        <CoverLetterSheet text={editing ? editText : (draft.cover_letter_text ?? '')} />
      </div>
    </>
  )
}

function CoverLetterSheet({ text }: { text: string }) {
  // Split into paragraphs on blank lines
  const blocks = text.split(/\n\n+/).map(b => b.trim()).filter(Boolean)

  return (
    <div
      className="cl-sheet bg-white text-black"
      style={{
        width: '8.5in',
        minHeight: '11in',
        padding: '1in',
        fontFamily: 'Garamond, "EB Garamond", "Adobe Garamond Pro", Georgia, serif',
        fontSize: '11pt',
        lineHeight: '1.6',
        boxShadow: '0 4px 32px rgba(0,0,0,0.35)',
      }}
    >
      {blocks.map((block, i) => {
        const isClosing = /^(sincerely|regards|best|thank you)/i.test(block)
        const isSalutation = /^dear /i.test(block)
        const isSignature = i === blocks.length - 1 && !isSalutation && !isClosing

        return (
          <div
            key={i}
            style={{
              marginBottom: isClosing || isSalutation ? '24pt' : isSignature ? '0' : '14pt',
              marginTop: isClosing ? '24pt' : '0',
            }}
          >
            {block.split('\n').map((line, j) => (
              <div key={j} style={{ minHeight: line ? undefined : '0' }}>
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
