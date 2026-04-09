'use client'

import { useEffect, useState } from 'react'
import {
  getRunDigests,
  getProcessedStates,
  getDailyCount,
  getSettings,
  saveRunDigest,
  generateId,
  todayDate,
} from '@/lib/storage'
import { buildDigestText, buildRecommendation, countDropReasons, countSources } from '@/lib/digest'
import type { RunDigest, DigestMetrics } from '@/lib/types'

export default function DigestPage() {
  const [digests, setDigests] = useState<RunDigest[]>([])
  const [selected, setSelected] = useState<RunDigest | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRunDigests().then((data) => {
      setDigests(data)
      if (data.length > 0) setSelected(data[0])
      setLoading(false)
    })
  }, [])

  async function handleGenerateDigest() {
    setGenerating(true)
    try {
      const today = todayDate()
      const [allStates, dailyCount, settings] = await Promise.all([
        getProcessedStates(),
        getDailyCount(today),
        getSettings(),
      ])

      const todayStates = allStates.filter((s) => s.last_seen === today)
      const generatedToday = todayStates.filter((s) => s.status === 'generated')
      const droppedToday = todayStates.filter((s) => s.status === 'dropped')

      const metricsPartial = {
        generated: dailyCount?.generated_count ?? generatedToday.length,
        dropped: dailyCount?.dropped_count ?? droppedToday.length,
        needs_jd: dailyCount?.needs_jd_count ?? todayStates.filter((s) => s.status === 'needs_jd').length,
        scored: dailyCount?.scored_count ?? todayStates.filter((s) => s.status === 'scored').length,
        daily_cap: settings?.daily_cap ?? 5,
        sources: countSources(todayStates),
        drop_reasons: countDropReasons(allStates),
        generated_files: generatedToday.map((s) => s.output_file ?? s.title),
      }

      const recommendation = buildRecommendation(metricsPartial)
      const metrics: DigestMetrics = { ...metricsPartial, recommendation }
      const digest_text = buildDigestText(today, metrics)

      const newDigest: Omit<RunDigest, 'user_id'> = {
        id: generateId(),
        date: today,
        digest_text,
        metrics,
        created_at: new Date().toISOString(),
      }

      await saveRunDigest(newDigest)
      const updated = await getRunDigests()
      setDigests(updated)
      setSelected(updated[0])
    } finally {
      setGenerating(false)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Daily Digest</h1>
          <p className="text-slate-500 text-sm mt-0.5">{digests.length} digest(s) on record</p>
        </div>
        <button
          onClick={handleGenerateDigest}
          disabled={generating}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
        >
          {generating ? 'Generating...' : 'Generate Today'}
        </button>
      </div>

      {digests.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm">No digests yet.</p>
          <p className="text-slate-600 text-xs mt-1">
            Click &quot;Generate Today&quot; to create a digest of today&apos;s activity.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Digest selector */}
          {digests.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {digests.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selected?.id === d.id
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {d.date}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="space-y-4">
              {/* Metrics cards */}
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Generated"
                  value={selected.metrics.generated}
                  sub={`of ${selected.metrics.daily_cap} cap`}
                  color="emerald"
                />
                <MetricCard
                  label="Dropped"
                  value={selected.metrics.dropped}
                  color="red"
                />
                <MetricCard
                  label="Scored"
                  value={selected.metrics.scored}
                  color="blue"
                />
                <MetricCard
                  label="Needs JD"
                  value={selected.metrics.needs_jd}
                  color="yellow"
                />
              </div>

              {/* Recommendation */}
              <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3">
                <p className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wide">
                  Recommendation
                </p>
                <p className="text-indigo-300 text-sm leading-relaxed">
                  {selected.metrics.recommendation}
                </p>
              </div>

              {/* Generated files */}
              {selected.metrics.generated_files.length > 0 && (
                <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
                  <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">
                    Generated Drafts
                  </p>
                  <div className="space-y-1">
                    {selected.metrics.generated_files.map((f, i) => (
                      <p key={i} className="text-emerald-400 text-xs">
                        • {f}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Drop reasons */}
              {Object.keys(selected.metrics.drop_reasons).length > 0 && (
                <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
                  <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">
                    Drop Reasons (lifetime)
                  </p>
                  <div className="space-y-1">
                    {Object.entries(selected.metrics.drop_reasons).map(([reason, count]) => (
                      <div key={reason} className="flex justify-between">
                        <p className="text-slate-400 text-xs truncate flex-1 mr-2">{reason}</p>
                        <p className="text-red-400 text-xs shrink-0">{count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sources */}
              {Object.keys(selected.metrics.sources).length > 0 && (
                <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
                  <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">
                    Sources
                  </p>
                  <div className="space-y-1">
                    {Object.entries(selected.metrics.sources).map(([src, count]) => (
                      <div key={src} className="flex justify-between">
                        <p className="text-slate-400 text-xs">{src}</p>
                        <p className="text-slate-300 text-xs">{count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw digest text */}
              <details className="group">
                <summary className="text-xs text-indigo-400 cursor-pointer hover:text-indigo-300">
                  Show raw digest
                </summary>
                <div className="rounded-xl bg-slate-900 border border-slate-700 p-4 mt-2">
                  <pre className="text-slate-400 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                    {selected.digest_text}
                  </pre>
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: number
  sub?: string
  color: 'emerald' | 'red' | 'blue' | 'yellow'
}) {
  const colorMap = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
  }
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3">
      <p className="text-slate-400 text-xs">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-slate-500 text-[10px] mt-0.5">{sub}</p>}
    </div>
  )
}
