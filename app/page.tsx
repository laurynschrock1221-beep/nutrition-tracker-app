'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getProcessedStatesByStatus,
  getTodayProcessedStates,
  getDailyCount,
  getSettings,
  getPendingManualRoles,
  getApplications,
  todayDate,
} from '@/lib/storage'
import type { ProcessedState, DailyCount, UserSettings, ApplicationEntry } from '@/lib/types'

const STATUS_COLORS: Record<string, string> = {
  generated: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  scored: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
  dropped: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
  needs_jd: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
}

function buildRecommendation(
  count: DailyCount | null,
  cap: number,
  pendingManual: number
): string {
  const gen = count?.generated_count ?? 0
  const dropped = count?.dropped_count ?? 0
  const scored = count?.scored_count ?? 0
  const needs_jd = count?.needs_jd_count ?? 0

  if (gen === 0 && scored === 0 && dropped === 0 && needs_jd === 0 && pendingManual === 0) {
    return 'No activity today. Paste a job description in the Manual tab to generate your first draft.'
  }
  if (pendingManual > 0 && gen === 0) {
    return `${pendingManual} manual role(s) waiting. Go to the Manual tab to generate drafts.`
  }
  if (gen >= cap) {
    return `Daily cap reached (${cap} generated). Review and copy your outputs from the Drafts tab.`
  }
  if (gen > 0) {
    return `${gen} draft(s) generated today. View outputs in the Drafts tab.`
  }
  if (needs_jd > 0 && gen === 0) {
    return `${needs_jd} role(s) missing JDs. Paste them in the Manual tab to generate drafts.`
  }
  if (dropped > 0 && gen === 0) {
    return 'All roles filtered out. Sources may be noisy or filters too strict.'
  }
  return 'No new drafts today. Safe to ignore this run.'
}

export default function DashboardPage() {
  const [todayStates, setTodayStates] = useState<ProcessedState[]>([])
  const [recentGenerated, setRecentGenerated] = useState<ProcessedState[]>([])
  const [followUpsDue, setFollowUpsDue] = useState<ApplicationEntry[]>([])
  const [topGaps, setTopGaps] = useState<{ gap: string; count: number }[]>([])
  const [dailyCount, setDailyCount] = useState<DailyCount | null>(null)
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [pendingManual, setPendingManual] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [todayS, generatedS, count, s, pending, apps] = await Promise.all([
        getTodayProcessedStates(),
        getProcessedStatesByStatus('generated'),
        getDailyCount(todayDate()),
        getSettings(),
        getPendingManualRoles(),
        getApplications(),
      ])
      setTodayStates(todayS)
      const sorted = [...generatedS].sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      )
      setRecentGenerated(sorted.slice(0, 3))

      // Aggregate gaps across all generated drafts
      const gapCounts: Record<string, number> = {}
      for (const draft of generatedS) {
        for (const gap of draft.gaps ?? []) {
          const key = gap.trim().toLowerCase()
          if (key) gapCounts[key] = (gapCounts[key] ?? 0) + 1
        }
      }
      const sorted_gaps = Object.entries(gapCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([gap, count]) => ({ gap, count }))
      setTopGaps(sorted_gaps)

      const today = todayDate()
      setFollowUpsDue(
        apps.filter(
          (a) =>
            a.follow_up_date &&
            a.follow_up_date <= today &&
            (a.status === 'applied' || a.status === 'interviewing')
        )
      )
      setDailyCount(count)
      setSettings(s)
      setPendingManual(pending.length)
      setLoading(false)
    }
    load()
  }, [])

  const cap = settings?.daily_cap ?? 5
  const gen = dailyCount?.generated_count ?? 0
  const dropped = dailyCount?.dropped_count ?? 0
  const scored = dailyCount?.scored_count ?? 0
  const needsJd = dailyCount?.needs_jd_count ?? 0
  const recommendation = buildRecommendation(dailyCount, cap, pendingManual)
  const hasResume = !!settings?.master_resume?.trim()

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
        <h1 className="text-xl font-semibold text-white">Today&apos;s Run</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {!hasResume && (
        <Link
          href="/settings"
          className="block rounded-2xl bg-[#111827]/80 border border-amber-500/30 backdrop-blur-md shadow-lg shadow-black/40 px-4 py-3"
        >
          <p className="text-amber-400 text-sm font-medium">Master resume not set up</p>
          <p className="text-amber-400/70 text-xs mt-0.5">
            Go to Settings to paste your resume — required for scoring and generation.
          </p>
        </Link>
      )}

      <div className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-violet-900/30 px-4 py-3">
        <p className="text-slate-400 text-sm leading-relaxed">{recommendation}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Generated" value={gen} max={cap} color="emerald" />
        <StatCard label="Scored" value={scored} color="blue" />
      </div>

      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>Daily cap</span>
          <span>
            {gen} / {cap}
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, (gen / cap) * 100)}%` }}
          />
        </div>
      </div>

      {pendingManual > 0 && (
        <Link
          href="/manual"
          className="flex items-center justify-between rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 px-4 py-3"
        >
          <div>
            <p className="text-white text-sm font-medium">
              {pendingManual} manual role(s) pending
            </p>
            <p className="text-slate-400 text-xs mt-0.5">Tap to process in Manual tab</p>
          </div>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 text-slate-400 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      )}

      {todayStates.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-400 mb-2">Today&apos;s Candidates</h2>
          <div className="space-y-2">
            {todayStates.slice(0, 6).map((role) => (
              <RoleRow key={role.id} role={role} />
            ))}
          </div>
          {todayStates.length > 6 && (
            <Link
              href="/candidates"
              className="block text-center text-xs text-violet-400 mt-2 py-1"
            >
              View all {todayStates.length} candidates
            </Link>
          )}
        </div>
      )}

      {followUpsDue.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-400 mb-2">Follow-ups Due</h2>
          <div className="space-y-2">
            {followUpsDue.map((app) => (
              <div
                key={app.id}
                className="rounded-2xl bg-[#111827]/80 border border-amber-500/30 backdrop-blur-md shadow-lg shadow-black/40 px-4 py-3 flex items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{app.title}</p>
                  <p className="text-slate-400 text-xs truncate">{app.company}</p>
                </div>
                <span className="text-amber-400 text-xs font-medium shrink-0">{app.follow_up_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentGenerated.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-400 mb-2">Recent Drafts</h2>
          <div className="space-y-2">
            {recentGenerated.map((role) => (
              <Link
                key={role.id}
                href="/drafts"
                className="flex items-center justify-between rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{role.title}</p>
                  <p className="text-slate-400 text-xs truncate">{role.company}</p>
                </div>
                {role.match_pct !== undefined && (
                  <span className="ml-3 text-xs font-medium shrink-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full">
                    {role.match_pct}% match
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {topGaps.length >= 3 && (
        <div>
          <h2 className="text-sm font-medium text-slate-400 mb-2">Resume Gap Summary</h2>
          <div className="rounded-2xl bg-[#111827]/80 border border-rose-500/20 backdrop-blur-md shadow-lg shadow-black/40 px-4 py-3 space-y-2">
            <p className="text-xs text-slate-400 leading-snug">
              These gaps appear most often across your generated drafts. Adding them to your master resume will improve future matches.
            </p>
            <div className="space-y-1.5">
              {topGaps.map(({ gap, count }, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="shrink-0 text-[10px] font-medium bg-rose-500/20 border border-rose-500/30 text-rose-400 px-1.5 py-0.5 rounded-full mt-0.5">
                    {count}×
                  </span>
                  <p className="text-xs text-slate-300 leading-snug">{gap}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Link
          href="/manual"
          className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-medium text-center py-3 transition-all shadow-lg shadow-violet-900/40"
        >
          Paste a JD
        </Link>
        <Link
          href="/drafts"
          className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-medium text-center py-3 transition-colors"
        >
          View Drafts
        </Link>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  max,
  color,
}: {
  label: string
  value: number
  max?: number
  color: 'emerald' | 'red' | 'blue' | 'yellow'
}) {
  return (
    <div className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 px-4 py-3">
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="text-2xl font-bold mt-1">
        <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
          {value}
        </span>
        {max !== undefined && (
          <span className="text-slate-500 text-sm font-normal"> / {max}</span>
        )}
      </p>
    </div>
  )
}

function RoleRow({ role }: { role: ProcessedState }) {
  return (
    <div className="rounded-2xl bg-[#111827]/80 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 px-4 py-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-medium truncate">{role.title}</p>
        <p className="text-slate-400 text-xs truncate">{role.company}</p>
      </div>
      <span
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[role.status] ?? 'bg-white/5 text-slate-400'}`}
      >
        {role.status.replace('_', ' ')}
      </span>
    </div>
  )
}
