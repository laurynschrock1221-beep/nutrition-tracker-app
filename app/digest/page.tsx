'use client'

import { useEffect, useState } from 'react'
import { getApplications, getProcessedStatesByStatus } from '@/lib/storage'
import type { ApplicationEntry, ApplicationStatus, ProcessedState } from '@/lib/types'

const STATUS_META: Record<ApplicationStatus, { label: string; color: string; emoji: string }> = {
  applied:           { label: 'Applied',             color: 'text-blue-400',    emoji: '📤' },
  no_response:       { label: 'No Response',         color: 'text-slate-400',   emoji: '👻' },
  invited_interview: { label: 'Phone / Interview',   color: 'text-indigo-400',  emoji: '📞' },
  interviewing:      { label: 'Interviewing',        color: 'text-yellow-400',  emoji: '🎙️' },
  offer:             { label: 'Offer',               color: 'text-emerald-400', emoji: '🎉' },
  rejected:          { label: 'Rejected',            color: 'text-red-400',     emoji: '❌' },
  withdrawn:         { label: 'Withdrawn',           color: 'text-slate-500',   emoji: '↩️' },
}

export default function MetricsPage() {
  const [apps, setApps] = useState<ApplicationEntry[]>([])
  const [drafts, setDrafts] = useState<ProcessedState[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getApplications(), getProcessedStatesByStatus('generated')]).then(([a, d]) => {
      setApps(a)
      setDrafts(d)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    )
  }

  const total = apps.length
  const counts = Object.fromEntries(
    (Object.keys(STATUS_META) as ApplicationStatus[]).map(s => [s, apps.filter(a => a.status === s).length])
  ) as Record<ApplicationStatus, number>

  const responded = counts.invited_interview + counts.interviewing + counts.offer + counts.rejected
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0
  const interviewRate = total > 0 ? Math.round(((counts.invited_interview + counts.interviewing + counts.offer) / total) * 100) : 0
  const ghostRate = total > 0 ? Math.round((counts.no_response / total) * 100) : 0

  // Role type breakdown — pull from title keywords
  const roleTypes: Record<string, { applied: number; responded: number }> = {}
  for (const app of apps) {
    const type = classifyTitle(app.title)
    if (!roleTypes[type]) roleTypes[type] = { applied: 0, responded: 0 }
    roleTypes[type].applied++
    if (['invited_interview', 'interviewing', 'offer'].includes(app.status)) {
      roleTypes[type].responded++
    }
  }
  const roleTypeEntries = Object.entries(roleTypes).sort((a, b) => b[1].applied - a[1].applied)

  // Match % correlation — drafts with match_pct vs their application outcome
  const draftMap = Object.fromEntries(drafts.map(d => [d.role_key, d]))
  const withMatch = apps
    .filter(a => a.role_key && draftMap[a.role_key]?.match_pct !== undefined)
    .map(a => ({
      company: a.company,
      title: a.title,
      status: a.status,
      match_pct: draftMap[a.role_key!]!.match_pct!,
    }))
    .sort((a, b) => b.match_pct - a.match_pct)

  const avgMatchAll = withMatch.length > 0
    ? Math.round(withMatch.reduce((s, a) => s + a.match_pct, 0) / withMatch.length)
    : null
  const avgMatchResponded = withMatch.filter(a => ['invited_interview', 'interviewing', 'offer'].includes(a.status)).length > 0
    ? Math.round(
        withMatch
          .filter(a => ['invited_interview', 'interviewing', 'offer'].includes(a.status))
          .reduce((s, a) => s + a.match_pct, 0) /
        withMatch.filter(a => ['invited_interview', 'interviewing', 'offer'].includes(a.status)).length
      )
    : null

  return (
    <div className="px-4 pt-6 pb-24 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Metrics</h1>
        <p className="text-slate-500 text-sm mt-0.5">{total} application{total !== 1 ? 's' : ''} tracked</p>
      </div>

      {total === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm">No applications tracked yet.</p>
          <p className="text-slate-600 text-xs mt-1">Add applications in the Tracker tab to see your metrics.</p>
        </div>
      ) : (
        <>
          {/* Funnel */}
          <Section title="Application Funnel">
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(counts) as [ApplicationStatus, number][])
                .filter(([, n]) => n > 0)
                .map(([status, n]) => {
                  const meta = STATUS_META[status]
                  return (
                    <div key={status} className="rounded-xl bg-slate-800/60 border border-slate-700 px-3 py-2.5">
                      <p className="text-slate-400 text-[10px] mb-0.5">{meta.emoji} {meta.label}</p>
                      <p className={`text-2xl font-bold ${meta.color}`}>{n}</p>
                      <p className="text-slate-500 text-[10px]">{Math.round((n / total) * 100)}% of total</p>
                    </div>
                  )
                })}
            </div>
          </Section>

          {/* Rates */}
          <Section title="Response Rates">
            <div className="grid grid-cols-3 gap-2">
              <RateCard label="Response Rate" value={responseRate} color="indigo" hint="any reply" />
              <RateCard label="Interview Rate" value={interviewRate} color="yellow" hint="got interview" />
              <RateCard label="Ghost Rate" value={ghostRate} color="red" hint="no reply" />
            </div>
          </Section>

          {/* Role type performance */}
          {roleTypeEntries.length > 0 && (
            <Section title="Role Type Performance">
              <div className="space-y-2">
                {roleTypeEntries.map(([type, data]) => (
                  <div key={type} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300 truncate">{type}</span>
                        <span className="text-slate-500 ml-2 shrink-0">{data.applied} applied · {data.responded} response{data.responded !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${data.applied > 0 ? Math.round((data.responded / data.applied) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-indigo-400 w-8 text-right shrink-0">
                      {data.applied > 0 ? Math.round((data.responded / data.applied) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Match % correlation */}
          {withMatch.length > 0 && (
            <Section title="Match Score Correlation">
              {avgMatchAll !== null && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-3 py-2.5">
                    <p className="text-slate-400 text-[10px] mb-0.5">Avg Match (all)</p>
                    <p className="text-2xl font-bold text-slate-200">{avgMatchAll}%</p>
                  </div>
                  {avgMatchResponded !== null && (
                    <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-3 py-2.5">
                      <p className="text-slate-400 text-[10px] mb-0.5">Avg Match (callbacks)</p>
                      <p className="text-2xl font-bold text-emerald-400">{avgMatchResponded}%</p>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                {withMatch.slice(0, 8).map((a, i) => {
                  const meta = STATUS_META[a.status]
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-8 text-right text-slate-400 shrink-0">{a.match_pct}%</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-300 truncate block">{a.title} · {a.company}</span>
                      </div>
                      <span className={`shrink-0 ${meta.color}`}>{meta.emoji}</span>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  )
}

function RateCard({ label, value, color, hint }: { label: string; value: number; color: 'indigo' | 'yellow' | 'red'; hint: string }) {
  const colorMap = { indigo: 'text-indigo-400', yellow: 'text-yellow-400', red: 'text-red-400' }
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-3 py-2.5 text-center">
      <p className={`text-xl font-bold ${colorMap[color]}`}>{value}%</p>
      <p className="text-slate-300 text-[10px] mt-0.5">{label}</p>
      <p className="text-slate-600 text-[9px]">{hint}</p>
    </div>
  )
}

function classifyTitle(title: string): string {
  const t = title.toLowerCase()
  if (/program|project/.test(t)) return 'Program / Project Mgmt'
  if (/operations|ops/.test(t)) return 'Operations'
  if (/compliance|regulatory/.test(t)) return 'Compliance / Regulatory'
  if (/salesforce|crm|systems/.test(t)) return 'CRM / Systems'
  if (/coordinator/.test(t)) return 'Coordinator'
  if (/manager/.test(t)) return 'Manager'
  if (/analyst/.test(t)) return 'Analyst'
  if (/partner|success/.test(t)) return 'Partner / Customer Success'
  if (/contract/.test(t)) return 'Contracts'
  return 'Other'
}
