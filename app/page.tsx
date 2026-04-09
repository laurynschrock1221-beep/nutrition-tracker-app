'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getProcessedStates,
  getTodayProcessedStates,
  getDailyCount,
  getSettings,
  getPendingManualRoles,
  todayDate,
} from '@/lib/storage'
import type { ProcessedState, DailyCount, UserSettings } from '@/lib/types'

const STATUS_COLORS: Record<string, string> = {
  generated: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  scored: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  dropped: 'bg-red-500/20 text-red-400 border border-red-500/30',
  needs_jd: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
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
  const [dailyCount, setDailyCount] = useState<DailyCount | null>(null)
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [pendingManual, setPendingManual] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [todayS, allS, count, s, pending] = await Promise.all([
        getTodayProcessedStates(),
        getProcessedStates(),
        getDailyCount(todayDate()),
        getSettings(),
        getPendingManualRoles(),
      ])
      setTodayStates(todayS)
      setRecentGenerated(allS.filter((r) => r.status === 'generated').slice(0, 5))
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
          className="block rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3"
        >
          <p className="text-amber-400 text-sm font-medium">Master resume not set up</p>
          <p className="text-amber-400/70 text-xs mt-0.5">
            Go to Settings to paste your resume — required for scoring and generation.
          </p>
        </Link>
      )}

      <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3">
        <p className="text-indigo-300 text-sm leading-relaxed">{recommendation}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Generated" value={gen} max={cap} color="emerald" />
        <StatCard label="Dropped" value={dropped} color="red" />
        <StatCard label="Scored" value={scored} color="blue" />
        <StatCard label="Needs JD" value={needsJd} color="yellow" />
      </div>

      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>Daily cap</span>
          <span>
            {gen} / {cap}
          </span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, (gen / cap) * 100)}%` }}
          />
        </div>
      </div>

      {pendingManual > 0 && (
        <Link
          href="/manual"
          className="flex items-center justify-between rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3"
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
              className="block text-center text-xs text-indigo-400 mt-2 py-1"
            >
              View all {todayStates.length} candidates
            </Link>
          )}
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
                className="flex items-center justify-between rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{role.title}</p>
                  <p className="text-slate-400 text-xs truncate">{role.company}</p>
                </div>
                {role.match_pct !== undefined && (
                  <span className="ml-3 text-xs text-emerald-400 font-medium shrink-0">
                    {role.match_pct}% match
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Link
          href="/manual"
          className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium text-center py-3 transition-colors"
        >
          Paste a JD
        </Link>
        <Link
          href="/drafts"
          className="rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium text-center py-3 transition-colors border border-slate-700"
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
  const colorMap = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
  }
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3">
      <p className="text-slate-400 text-xs">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colorMap[color]}`}>
        {value}
        {max !== undefined && (
          <span className="text-slate-500 text-sm font-normal"> / {max}</span>
        )}
      </p>
    </div>
  )
}

function RoleRow({ role }: { role: ProcessedState }) {
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-medium truncate">{role.title}</p>
        <p className="text-slate-400 text-xs truncate">{role.company}</p>
      </div>
      <span
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[role.status] ?? 'bg-slate-700 text-slate-400'}`}
      >
        {role.status.replace('_', ' ')}
      </span>
    </div>
  )
}
