'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getProcessedStateById, saveProcessedState } from '@/lib/storage'
import { ContactLine } from '@/app/resume-preview/[id]/page'
import type { ProcessedState } from '@/lib/types'

export default function CoverLetterPreviewPage() {
  const { id } = useParams<{ id: string }>()
  const [draft, setDraft] = useState<ProcessedState | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(1)

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
        @page { size: letter; margin: 0; }
        @media print {
          html, body { background: white !important; margin: 0 !important; }
          body * { visibility: hidden; }
          .cl-sheet, .cl-sheet * { visibility: visible; }
          .cl-sheet {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 8.5in !important;
            min-height: 11in !important;
            padding: 1in !important;
            box-shadow: none !important;
            margin: 0 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-slate-700">
        {/* Row 1: close, title, primary action */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 gap-2">
          <button
            onClick={() => window.close()}
            className="text-slate-400 hover:text-white text-sm whitespace-nowrap transition-colors"
          >
            ← Close
          </button>
          <div className="flex-1 min-w-0 px-2">
            <p className="text-white text-sm font-medium truncate">{draft.title}</p>
            <p className="text-slate-400 text-xs truncate">{draft.company}</p>
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
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
            </div>
          ) : (
            <button
              onClick={() => window.print()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors"
            >
              Save as PDF
            </button>
          )}
        </div>

        {/* Row 2: zoom + edit (hidden while editing) */}
        {!editing && (
          <div className="flex items-center justify-between px-3 pb-2 gap-2">
            <div className="w-16" />
            <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1)))}
                className="text-slate-300 hover:text-white text-base px-3 py-1 transition-colors"
              >−</button>
              <span className="text-slate-400 text-xs px-2">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))}
                className="text-slate-300 hover:text-white text-base px-3 py-1 transition-colors"
              >+</button>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white text-sm px-3 py-1 rounded-lg transition-colors"
            >
              Edit Text
            </button>
          </div>
        )}
      </div>

      {/* Page body */}
      <div className="no-print pt-24 min-h-screen bg-slate-800 flex flex-col items-center py-8 px-2">
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
          <ScaledCoverLetterSheet text={draft.cover_letter_text ?? ''} userZoom={zoom} />
        )}
      </div>

    </>
  )
}

function ScaledCoverLetterSheet({ text, userZoom }: { text: string; userZoom: number }) {
  const [autoScale, setAutoScale] = React.useState(1)

  React.useEffect(() => {
    function calcScale() {
      const vw = window.innerWidth
      const sheetPx = 8.5 * 96
      setAutoScale(vw < sheetPx ? (vw - 16) / sheetPx : 1)
    }
    calcScale()
    window.addEventListener('resize', calcScale)
    return () => window.removeEventListener('resize', calcScale)
  }, [])

  const scale = autoScale * userZoom
  const sheetPx = 8.5 * 96
  const scaledHeight = 11 * 96 * scale

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
      <div style={{ width: sheetPx * scale, height: scaledHeight, position: 'relative', flexShrink: 0 }}>
        <div style={{ transformOrigin: 'top left', transform: `scale(${scale})`, width: sheetPx, position: 'absolute', top: 0, left: 0 }}>
          <CoverLetterSheet text={text} />
        </div>
      </div>
    </div>
  )
}

function CoverLetterSheet({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/).map(b => b.trim()).filter(Boolean)
  // Header block is everything before "Dear Hiring Manager"
  const dearIdx = blocks.findIndex(b => /^dear /i.test(b))

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
        const isHeader = dearIdx > 0 && i < dearIdx

        return (
          <div
            key={i}
            style={{
              marginBottom: isClosing || isSalutation ? '24pt' : isSignature ? '0' : '14pt',
              marginTop: isClosing ? '24pt' : '0',
            }}
          >
            {isHeader ? (
              // Render header lines with hyperlink support
              block.split('\n').map((line, j) => (
                <div key={j} style={{ fontWeight: j === 0 ? 'bold' : 'normal', fontSize: j === 0 ? '13pt' : '10pt' }}>
                  {j === 0 ? line : <ContactLine text={line} />}
                </div>
              ))
            ) : (
              block.split('\n').map((line, j) => (
                <div key={j} style={{ minHeight: line ? undefined : '0' }}>
                  {line || '\u00A0'}
                </div>
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}
