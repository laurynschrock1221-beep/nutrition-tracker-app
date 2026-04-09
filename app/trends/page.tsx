'use client'

import { useEffect, useState } from 'react'
import { getDailyLogs, getLoggedMeals, getActivityLogs, getSettings } from '@/lib/storage'
import {
  buildWeightTrend,
  computeWeeklyStats,
  computeGoalProgress,
  fmtDate,
} from '@/lib/compute'
import type { WeightPoint, GoalProgress } from '@/lib/types'

// ── Simple SVG line chart ────────────────────────────────────────────────────

function WeightChart({ data }: { data: WeightPoint[] }) {
  const valid = data.filter((d) => d.weight != null)
  if (valid.length < 2) {
    return (
      <div className="flex items-center justify-center h-36 text-slate-600 text-sm">
        Log at least 2 weigh-ins to see your chart
      </div>
    )
  }

  const W = 320
  const H = 120
  const PAD = { top: 10, right: 12, bottom: 28, left: 36 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const weights = valid.map((d) => d.weight!)
  const allVals = [...weights, ...valid.map((d) => d.rolling_avg ?? 0).filter(Boolean)]
  const minW = Math.floor(Math.min(...allVals)) - 0.5
  const maxW = Math.ceil(Math.max(...allVals)) + 0.5

  const xPos = (i: number) => PAD.left + (i / (valid.length - 1)) * chartW
  const yPos = (w: number) => PAD.top + ((maxW - w) / (maxW - minW)) * chartH

  const weightPath = valid
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(d.weight!).toFixed(1)}`)
    .join(' ')

  const avgPath = valid
    .filter((d) => d.rolling_avg != null)
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(d.rolling_avg!).toFixed(1)}`)
    .join(' ')

  const yTicks = [minW + 0.5, (minW + maxW) / 2, maxW - 0.5].map((v) => Math.round(v * 2) / 2)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} y1={yPos(tick)} x2={W - PAD.right} y2={yPos(tick)} stroke="#1e293b" strokeWidth="1" />
          <text x={PAD.left - 4} y={yPos(tick) + 4} textAnchor="end" fill="#475569" fontSize="9">{tick}</text>
        </g>
      ))}
      {avgPath && <path d={avgPath} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,3" opacity={0.7} />}
      <path d={weightPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
      {valid.map((d, i) => (
        <circle key={i} cx={xPos(i)} cy={yPos(d.weight!)} r="3" fill="#10b981" stroke="#020617" strokeWidth="1.5" />
      ))}
      {[0, Math.floor(valid.length / 2), valid.length - 1]
        .filter((idx, pos, arr) => arr.indexOf(idx) === pos && idx < valid.length)
        .map((idx) => (
          <text key={idx} x={xPos(idx)} y={H - 4} textAnchor="middle" fill="#475569" fontSize="8">
            {fmtDate(valid[idx].date)}
          </text>
        ))}
    </svg>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

// ── Trend note ───────────────────────────────────────────────────────────────

function getTrendNote(weeklyStats: ReturnType<typeof computeWeeklyStats>, trend: WeightPoint[]): string {
  const { avg_calories, avg_protein, est_deficit, effective_tdee } = weeklyStats
  if (trend.length < 3) return 'Log a few more days to see trend analysis.'
  if (avg_protein < 100) return 'Protein is averaging low this week. Aim for more lean protein at each meal.'
  if (est_deficit > 500) return `Large estimated deficit (${est_deficit} cal/day). Make sure you're not under-fueling training.`
  if (est_deficit > 200) return `You're in a moderate deficit (~${est_deficit} cal/day). Consistent pattern for gradual fat loss.`
  if (avg_calories > effective_tdee) return `Calorie average is above your maintenance (${effective_tdee} cal). Check for high-fat days pulling the average up.`
  const weights = trend.filter((d) => d.weight != null).map((d) => d.weight!)
  if (weights.length >= 3) {
    const first = weights.slice(0, 3).reduce((s, w) => s + w, 0) / 3
    const last = weights.slice(-3).reduce((s, w) => s + w, 0) / 3
    const diff = last - first
    if (Math.abs(diff) < 0.3) return 'Weight has been stable. Could be real maintenance or retention masking progress.'
    if (diff < -0.5) return `Weight trending down ~${Math.abs(diff).toFixed(1)} lbs. Real fat loss is likely given consistent intake.`
    if (diff > 0.5) return 'Weight trending up. Check for high-sodium days, training load, or hormonal factors.'
  }
  return 'Pattern looks consistent. Keep logging to build a clearer trend.'
}

// ── Weight log table ─────────────────────────────────────────────────────────

function WeightTable({ data }: { data: WeightPoint[] }) {
  const rows = [...data].reverse().slice(0, 10)
  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.date} className="flex items-center justify-between text-sm py-2 border-b border-slate-800/50 last:border-0">
          <span className="text-slate-400 text-xs">{fmtDate(row.date)}</span>
          <div className="flex items-center gap-4">
            <span className="font-medium">{row.weight ? `${row.weight} lbs` : '—'}</span>
            {row.rolling_avg && <span className="text-blue-400 text-xs">avg {row.rolling_avg}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TrendsPage() {
  const [mounted, setMounted] = useState(false)
  const [trend, setTrend] = useState<WeightPoint[]>([])
  const [weeklyStats, setWeeklyStats] = useState<ReturnType<typeof computeWeeklyStats> | null>(null)
  const [goalProgress, setGoalProgress] = useState<GoalProgress | null>(null)
  const [projectionDate, setProjectionDate] = useState('')
  const [trendCoaching, setTrendCoaching] = useState<string | null>(null)
  const [loadingCoaching, setLoadingCoaching] = useState(false)

  useEffect(() => {
    const init = async () => {
      setMounted(true)
      const [logs, meals, activities, settings] = await Promise.all([
        getDailyLogs(),
        getLoggedMeals(),
        getActivityLogs(),
        getSettings(),
      ])
      const weightTrend = buildWeightTrend(logs, 14)
      const stats = computeWeeklyStats(logs, meals, settings, activities)
      setTrend(weightTrend)
      setWeeklyStats(stats)
      const latestWeight = weightTrend.filter((p) => p.weight != null).at(-1)?.weight
      const avgDeficit = stats.est_deficit > 0 ? stats.est_deficit : undefined
      setGoalProgress(computeGoalProgress(settings, latestWeight, avgDeficit))
    }
    void init()
  }, [])

  if (!mounted) return null

  const trendNote = weeklyStats ? getTrendNote(weeklyStats, trend) : null

  const handleGetCoaching = async () => {
    if (!weeklyStats) return
    setLoadingCoaching(true)
    setTrendCoaching(null)
    const settings = await getSettings()
    try {
      const res = await fetch('/api/trend-coaching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avg_calories: weeklyStats.avg_calories,
          avg_protein: weeklyStats.avg_protein,
          avg_weight: weeklyStats.avg_weight,
          est_deficit: weeklyStats.est_deficit,
          effective_tdee: weeklyStats.effective_tdee,
          weight_points: trend,
          cal_target_min: settings.calorie_target_min,
          cal_target_max: settings.calorie_target_max,
          pro_target: settings.protein_target_min,
          tdee: settings.tdee,
          weight_lbs: settings.weight_lbs,
          days_logged: trend.filter((p) => p.weight != null).length,
          goal_bf_pct: goalProgress?.goal_bf_pct,
          current_bf_pct: goalProgress?.current_bf_pct,
          estimated_bf_now: goalProgress?.estimated_bf_now,
          fat_to_lose_lbs: goalProgress?.estimated_fat_remaining ?? goalProgress?.fat_to_lose_lbs,
          lean_mass_lbs: goalProgress?.lean_mass_lbs,
          weeks_to_goal: goalProgress?.weeks_to_goal,
        }),
      })
      const json = await res.json() as { recommendation?: string; error?: string }
      if (json.recommendation) setTrendCoaching(json.recommendation)
    } catch {
      setTrendCoaching('Unable to load coaching right now. Try again in a moment.')
    } finally {
      setLoadingCoaching(false)
    }
  }

  return (
    <div className="px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold">Trends</h1>
        <p className="text-slate-400 text-sm">Last 14 days</p>
      </div>

      {/* Weight chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Weight</h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-4 h-0.5 bg-emerald-500 inline-block" />Daily
            </span>
            <span className="flex items-center gap-1 text-blue-400">
              <span className="w-4 h-0 border-t-2 border-dashed border-blue-500 inline-block" />7-day avg
            </span>
          </div>
        </div>
        <WeightChart data={trend} />
      </div>

      {/* Goal progress */}
      {goalProgress && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Body Composition Goal</h2>
            <span className="text-xs text-slate-500">{goalProgress.current_bf_pct}% → {goalProgress.goal_bf_pct}% BF</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{goalProgress.estimated_bf_now != null ? `~${goalProgress.estimated_bf_now}% now (est.)` : `${goalProgress.current_bf_pct}% at measurement`}</span>
              <span className="text-emerald-400">{goalProgress.goal_bf_pct}% goal</span>
            </div>
            <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0,
                    ((goalProgress.current_bf_pct - (goalProgress.estimated_bf_now ?? goalProgress.current_bf_pct)) /
                     (goalProgress.current_bf_pct - goalProgress.goal_bf_pct)) * 100
                  ))}%`,
                }}
              />
            </div>
            {goalProgress.days_since_measured > 0 && (
              <p className="text-xs text-slate-600">Measured {goalProgress.days_since_measured} days ago</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500">Lean mass</p>
              <p className="font-bold text-sm mt-0.5">{goalProgress.lean_mass_lbs} lbs</p>
              <p className="text-xs text-slate-600">preserve this</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500">Fat to lose</p>
              <p className="font-bold text-sm mt-0.5 text-amber-400">{goalProgress.estimated_fat_remaining ?? goalProgress.fat_to_lose_lbs} lbs</p>
              <p className="text-xs text-slate-600">to reach goal</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500">Est. timeline</p>
              <p className="font-bold text-sm mt-0.5 text-blue-400">{goalProgress.weeks_to_goal != null ? `${goalProgress.weeks_to_goal}w` : '—'}</p>
              <p className="text-xs text-slate-600">at avg deficit</p>
            </div>
          </div>

          {goalProgress.weeks_to_goal == null && (
            <p className="text-xs text-slate-600">Set your TDEE in Settings to get a timeline estimate based on your current deficit.</p>
          )}

          {/* Date projection */}
          {weeklyStats && weeklyStats.est_deficit > 0 && (() => {
            const latestWeight = trend.filter((p) => p.weight != null).at(-1)?.weight
              ?? (goalProgress.lean_mass_lbs + (goalProgress.estimated_fat_remaining ?? goalProgress.fat_to_lose_lbs))
            const projection = (() => {
              if (!projectionDate) return null
              const daysUntil = Math.round(
                (new Date(projectionDate + 'T12:00:00').getTime() - Date.now()) / 86_400_000
              )
              if (daysUntil <= 0) return null
              const projectedFatLoss = (weeklyStats.est_deficit * daysUntil) / 3500
              const projectedWeight = Math.max(goalProgress.lean_mass_lbs, latestWeight - projectedFatLoss)
              const projectedFatLbs = projectedWeight - goalProgress.lean_mass_lbs
              const projectedBfPct = Math.round((projectedFatLbs / projectedWeight) * 1000) / 10
              const goalReached = projectedBfPct <= goalProgress.goal_bf_pct
              return { daysUntil, projectedWeight: Math.round(projectedWeight * 10) / 10, projectedBfPct, projectedFatLoss: Math.round(projectedFatLoss * 10) / 10, goalReached }
            })()

            return (
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Project to a Date</p>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={projectionDate}
                    onChange={(e) => setProjectionDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  {projectionDate && !projection && (
                    <span className="text-xs text-slate-500">Pick a future date</span>
                  )}
                </div>
                {projection && (
                  <div className="bg-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">In {projection.daysUntil} days</span>
                      {projection.goalReached && <span className="text-xs text-emerald-400 font-semibold">Goal reached</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-slate-500">Weight</p>
                        <p className="font-bold text-sm mt-0.5">{projection.projectedWeight} lbs</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Body fat</p>
                        <p className={`font-bold text-sm mt-0.5 ${projection.goalReached ? 'text-emerald-400' : 'text-blue-400'}`}>~{projection.projectedBfPct}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Fat lost</p>
                        <p className="font-bold text-sm mt-0.5 text-amber-400">{projection.projectedFatLoss} lbs</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">Based on {weeklyStats.est_deficit} cal/day avg deficit. Assumes consistent logging.</p>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Weekly stats */}
      {weeklyStats && (
        <div className="space-y-3">
          <h2 className="font-semibold">This Week</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Avg Calories" value={weeklyStats.avg_calories > 0 ? weeklyStats.avg_calories.toString() : '—'} sub="per day (logged days)" />
            <StatCard label="Avg Protein" value={weeklyStats.avg_protein > 0 ? `${weeklyStats.avg_protein}g` : '—'} sub="per day" color={weeklyStats.avg_protein >= 110 ? 'text-emerald-400' : 'text-amber-400'} />
            <StatCard
              label="Est. Deficit"
              value={weeklyStats.est_deficit > 0 ? `${weeklyStats.est_deficit} cal` : weeklyStats.est_deficit < 0 ? `+${Math.abs(weeklyStats.est_deficit)} surplus` : '—'}
              sub={weeklyStats.avg_calories_burned > 0
                ? `TDEE ${weeklyStats.effective_tdee} + ~${weeklyStats.avg_calories_burned} activity`
                : `vs ${weeklyStats.effective_tdee} cal maintenance`}
              color={weeklyStats.est_deficit > 0 ? 'text-emerald-400' : 'text-amber-400'}
            />
            {weeklyStats.avg_weight && <StatCard label="Avg Weight" value={`${weeklyStats.avg_weight} lbs`} sub="7-day rolling" />}
            {weeklyStats.adjusted_tdee && <StatCard label="Adjusted TDEE" value={`${weeklyStats.adjusted_tdee} cal`} sub="Recalculated for current weight" color="text-blue-400" />}
          </div>
        </div>
      )}

      {/* Trend note */}
      {trendNote && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Trend Analysis</p>
          <p className="text-sm leading-relaxed text-slate-200">{trendNote}</p>
        </div>
      )}

      {/* Weekly coaching */}
      {weeklyStats && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Weekly Coaching</p>
              <p className="text-xs text-slate-600 mt-0.5">Pattern-based analysis of your week</p>
            </div>
            {!trendCoaching && !loadingCoaching && (
              <button onClick={() => void handleGetCoaching()} className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Get Coaching</button>
            )}
            {trendCoaching && !loadingCoaching && (
              <button onClick={() => void handleGetCoaching()} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">Refresh</button>
            )}
          </div>
          {loadingCoaching && <p className="text-sm text-slate-400">Analyzing your week...</p>}
          {trendCoaching && !loadingCoaching && <p className="text-sm leading-relaxed text-slate-200">{trendCoaching}</p>}
          {!trendCoaching && !loadingCoaching && <p className="text-sm text-slate-600">Tap to get personalized coaching based on your patterns this week.</p>}
        </div>
      )}

      {/* Weight log table */}
      {trend.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">Recent Weigh-Ins</h2>
          <WeightTable data={trend} />
        </div>
      )}

      {trend.length === 0 && (
        <div className="text-center py-16 space-y-2">
          <p className="text-slate-500 text-sm">No weight data yet.</p>
          <p className="text-slate-600 text-xs">Log your morning weight in the daily check-in.</p>
        </div>
      )}
    </div>
  )
}
