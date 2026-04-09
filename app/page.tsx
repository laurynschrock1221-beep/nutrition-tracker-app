'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  getDailyLog,
  saveDailyLog,
  getLoggedMeals,
  getActivityLogs,
  getHydrationLogs,
  getSettings,
  deleteLoggedMeal,
  generateId,
  todayDate,
  seedDraftMealsIfEmpty,
  DEFAULT_SETTINGS,
} from '@/lib/storage'
import { computeDayTotals, getDayRecommendation, getTargetsForDayType, computeGoalProgress, pct } from '@/lib/compute'
import type { DailyLog, LoggedMeal, DayTotals, UserSettings } from '@/lib/types'

function ProgressBar({
  value,
  max,
  color = 'bg-emerald-500',
}: {
  value: number
  max: number
  color?: string
}) {
  const p = pct(value, max)
  return (
    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${p}%` }}
      />
    </div>
  )
}

function MacroRow({
  label,
  value,
  target,
  unit,
  color,
}: {
  label: string
  value: number
  target: number
  unit: string
  color: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium">
          {value}
          <span className="text-slate-500">
            /{target}
            {unit}
          </span>
        </span>
      </div>
      <ProgressBar value={value} max={target} color={color} />
    </div>
  )
}

function DayTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    rest: { label: 'Rest Day', cls: 'bg-slate-700 text-slate-300' },
    moderate: { label: 'Moderate', cls: 'bg-blue-900 text-blue-300' },
    'high-output': { label: 'High Output', cls: 'bg-amber-900 text-amber-300' },
  }
  const { label, cls } = map[type] ?? map['rest']
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
  )
}

export default function TodayPage() {
  const [date] = useState(todayDate)
  const [log, setLog] = useState<DailyLog | null>(null)
  const [meals, setMeals] = useState<LoggedMeal[]>([])
  const [totals, setTotals] = useState<DayTotals | null>(null)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [mounted, setMounted] = useState(false)
  const [loadingRecommendation, setLoadingRecommendation] = useState(false)
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null)
  const [stepInput, setStepInput] = useState('')
  const [savingSteps, setSavingSteps] = useState(false)

  const load = useCallback(async () => {
    const [s, dayLog, dayMeals, dayActivities, dayHydration] = await Promise.all([
      getSettings(),
      getDailyLog(date),
      getLoggedMeals(date),
      getActivityLogs(date),
      getHydrationLogs(date),
    ])
    setSettings(s)
    setLog(dayLog)
    setMeals(dayMeals.sort((a, b) => a.time.localeCompare(b.time)))
    setTotals(computeDayTotals(dayLog, dayMeals, dayActivities, dayHydration, s))
    setAiRecommendation(null)
  }, [date])

  useEffect(() => {
    setMounted(true)
    void seedDraftMealsIfEmpty()
    void load()
  }, [load])

  useEffect(() => {
    if (!totals) return

    const calTarget = log?.calorie_target_max ?? settings.calorie_target_max
    const calMin = log?.calorie_target_min ?? settings.calorie_target_min
    const proMin = log?.protein_target_min ?? settings.protein_target_min
    const hydTarget = log?.hydration_target_oz ?? settings.hydration_target_oz

    let adjustedTdee = settings.tdee
    const currentWeight = log?.morning_weight
    if (settings.tdee && settings.weight_lbs && currentWeight && Math.abs(currentWeight - settings.weight_lbs) >= 1) {
      adjustedTdee = Math.round(settings.tdee * (currentWeight / settings.weight_lbs))
    }

    const dailyDeficit = adjustedTdee != null
      ? (adjustedTdee + (totals.calories_burned ?? 0)) - totals.calories
      : undefined

    setLoadingRecommendation(true)
    fetch('/api/coaching', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        hydration_oz: totals.hydration_oz,
        day_type: totals.day_type,
        calories_remaining: totals.calories_remaining,
        protein_remaining: totals.protein_remaining,
        hydration_remaining: totals.hydration_remaining,
        cal_target_min: calMin,
        cal_target_max: calTarget,
        pro_target: proMin,
        hyd_target: hydTarget,
        tdee: adjustedTdee,
        daily_deficit: dailyDeficit,
        recovery_flag: totals.recovery_flag,
        retention_flag: totals.retention_flag,
        pr_today: totals.pr_today,
        fatigue_level: log?.fatigue_level ?? 0,
        soreness_level: log?.soreness_level ?? 0,
        period_flag: log?.period_flag ?? false,
        restaurant_meal_flag: log?.restaurant_meal_flag ?? false,
        hour: new Date().getHours(),
        ...(() => {
          const goal = computeGoalProgress(settings, log?.morning_weight, adjustedTdee ? adjustedTdee - totals.calories : undefined)
          if (!goal) return {}
          return {
            goal_bf_pct: goal.goal_bf_pct,
            current_bf_pct: goal.current_bf_pct,
            estimated_bf_now: goal.estimated_bf_now,
            fat_to_lose_lbs: goal.estimated_fat_remaining ?? goal.fat_to_lose_lbs,
            lean_mass_lbs: goal.lean_mass_lbs,
            weeks_to_goal: goal.weeks_to_goal,
          }
        })(),
      }),
    })
      .then((res) => res.json() as Promise<{ recommendation?: string; error?: string }>)
      .then((json) => {
        if (json.recommendation) setAiRecommendation(json.recommendation)
      })
      .catch(() => { /* fall back to local recommendation */ })
      .finally(() => setLoadingRecommendation(false))
  }, [totals, log, settings])

  const handleDeleteMeal = async (id: string) => {
    await deleteLoggedMeal(id)
    void load()
  }

  const handleSaveSteps = async () => {
    const steps = parseInt(stepInput)
    if (!steps || steps < 0) return
    setSavingSteps(true)
    const existing = await getDailyLog(date)
    await saveDailyLog({
      id: existing?.id ?? generateId(),
      date,
      calorie_target_min: existing?.calorie_target_min ?? settings.calorie_target_min,
      calorie_target_max: existing?.calorie_target_max ?? settings.calorie_target_max,
      protein_target_min: existing?.protein_target_min ?? settings.protein_target_min,
      protein_target_max: existing?.protein_target_max ?? settings.protein_target_max,
      hydration_target_oz: existing?.hydration_target_oz ?? settings.hydration_target_oz,
      soreness_level: existing?.soreness_level ?? 0,
      fatigue_level: existing?.fatigue_level ?? 0,
      period_flag: existing?.period_flag ?? false,
      restaurant_meal_flag: existing?.restaurant_meal_flag ?? false,
      notes: existing?.notes,
      morning_weight: existing?.morning_weight,
      manual_steps: steps,
    })
    setSavingSteps(false)
    setStepInput('')
    void load()
  }

  if (!mounted) return null

  const calTarget = log?.calorie_target_max ?? settings.calorie_target_max
  const calMin = log?.calorie_target_min ?? settings.calorie_target_min
  const proMin = log?.protein_target_min ?? settings.protein_target_min
  const hydTarget = log?.hydration_target_oz ?? settings.hydration_target_oz

  const macroTargets = totals
    ? getTargetsForDayType(totals.day_type, calTarget, calMin, proMin, settings.carb_target_g, settings.fat_target_g)
    : null

  const dailyDeficit = (() => {
    if (!settings.tdee || !totals) return null
    let tdee = settings.tdee
    const currentWeight = log?.morning_weight
    if (settings.weight_lbs && currentWeight && Math.abs(currentWeight - settings.weight_lbs) >= 1) {
      tdee = Math.round(settings.tdee * (currentWeight / settings.weight_lbs))
    }
    // Add net activity burn on top of sedentary TDEE — user enters TDEE at rest,
    // so any calories burned exercising increase total expenditure for the day.
    const totalExpenditure = tdee + (totals.calories_burned ?? 0)
    return { deficit: totalExpenditure - totals.calories, tdee, calories_burned: totals.calories_burned ?? 0 }
  })()

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const recommendation = totals
    ? (aiRecommendation ?? getDayRecommendation(totals, log))
    : 'Log your check-in to get personalized guidance.'

  return (
    <div className="px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Today</h1>
          <p className="text-slate-400 text-sm">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {totals && <DayTypeBadge type={totals.day_type} />}
          <Link
            href="/settings"
            className="text-slate-500 hover:text-slate-300 text-lg transition-colors"
            aria-label="Settings"
          >
            ⚙️
          </Link>
        </div>
      </div>

      {/* Check-In Card */}
      {!log ? (
        <Link
          href="/check-in"
          className="block bg-emerald-900/30 border border-emerald-700/50 rounded-2xl p-4 text-center"
        >
          <p className="text-emerald-300 font-medium">Log morning check-in →</p>
          <p className="text-slate-400 text-sm mt-1">
            Weight, fatigue, soreness, and today&apos;s targets
          </p>
        </Link>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wider">Morning Weight</p>
              <p className="text-2xl font-bold mt-0.5">
                {log.morning_weight ? `${log.morning_weight} lbs` : '—'}
              </p>
            </div>
            <div className="text-right space-y-1 flex-1 px-4">
              {log.fatigue_level > 0 && (
                <p className="text-sm text-slate-400">
                  Fatigue <span className="font-medium text-white">{log.fatigue_level}/5</span>
                </p>
              )}
              {log.soreness_level > 0 && (
                <p className="text-sm text-slate-400">
                  Soreness <span className="font-medium text-white">{log.soreness_level}/5</span>
                </p>
              )}
            </div>
            <Link href="/check-in" className="text-slate-500 text-xs hover:text-slate-300">
              Edit
            </Link>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {log.period_flag && (
              <span className="text-xs bg-pink-900/40 text-pink-300 px-2 py-0.5 rounded-full">
                Period
              </span>
            )}
            {log.restaurant_meal_flag && (
              <span className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full">
                Dinner out
              </span>
            )}
            {totals?.retention_flag && (
              <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full">
                Retention likely
              </span>
            )}
            {totals?.recovery_flag && (
              <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded-full">
                High fatigue
              </span>
            )}
            {totals?.pr_today && (
              <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-2 py-0.5 rounded-full">
                🏆 PR Day
              </span>
            )}
          </div>
        </div>
      )}

      {/* Recommendation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">Recommendation</p>
        {loadingRecommendation ? (
          <p className="text-sm leading-relaxed text-slate-400">Getting your guidance...</p>
        ) : (
          <p className="text-sm leading-relaxed text-slate-200">{recommendation}</p>
        )}
      </div>

      {/* Calories + Macros */}
      {totals && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex justify-between items-baseline">
            <h2 className="font-semibold">Calories</h2>
            <span className="text-2xl font-bold">
              {totals.calories}
              <span className="text-slate-500 text-sm font-normal">
                /{macroTargets?.caloriesMin ?? calMin}–{macroTargets?.caloriesMax ?? calTarget}
              </span>
            </span>
          </div>
          <ProgressBar
            value={totals.calories}
            max={macroTargets?.caloriesMax ?? calTarget}
            color={totals.calories > (macroTargets?.caloriesMax ?? calTarget) ? 'bg-red-500' : 'bg-emerald-500'}
          />

          {dailyDeficit && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {dailyDeficit.calories_burned > 0
                  ? `${dailyDeficit.tdee} TDEE + ${dailyDeficit.calories_burned} burned`
                  : `vs ${dailyDeficit.tdee} cal TDEE`}
              </span>
              <span
                className={`font-semibold ${
                  dailyDeficit.deficit > 0
                    ? 'text-emerald-400'
                    : dailyDeficit.deficit < -100
                      ? 'text-red-400'
                      : 'text-amber-400'
                }`}
              >
                {dailyDeficit.deficit > 0
                  ? `−${dailyDeficit.deficit} deficit`
                  : dailyDeficit.deficit < 0
                    ? `+${Math.abs(dailyDeficit.deficit)} surplus`
                    : 'at maintenance'}
              </span>
            </div>
          )}

          {macroTargets?.adjusted && (
            <p className="text-xs text-slate-500 -mt-1">
              {totals.day_type === 'high-output'
                ? 'Targets adjusted for high-output day — more carbs, slightly more protein.'
                : 'Targets adjusted for rest day — lower carbs.'}
            </p>
          )}

          <div className="space-y-3 pt-1">
            <MacroRow
              label="Protein"
              value={totals.protein}
              target={macroTargets?.protein ?? proMin}
              unit="g"
              color={totals.protein >= (macroTargets?.protein ?? proMin) ? 'bg-emerald-500' : 'bg-amber-500'}
            />
            <MacroRow
              label="Carbs"
              value={totals.carbs}
              target={macroTargets?.carbs ?? Math.round((calTarget * 0.4) / 4)}
              unit="g"
              color="bg-blue-500"
            />
            <MacroRow
              label="Fat"
              value={totals.fat}
              target={macroTargets?.fat ?? Math.round((calTarget * 0.3) / 9)}
              unit="g"
              color="bg-purple-500"
            />
          </div>

          {(() => {
            const protTarget = macroTargets?.protein ?? proMin
            const protLeft = Math.max(0, protTarget - totals.protein)
            const calLeft = Math.max(0, (macroTargets?.caloriesMin ?? calMin) - totals.calories)
            return (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
                <div className="text-center">
                  <p className="text-xs text-slate-500">Cal left</p>
                  <p className={`font-bold text-lg ${calLeft === 0 ? 'text-slate-500' : 'text-emerald-400'}`}>
                    {calLeft}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">Protein left</p>
                  <p className={`font-bold text-lg ${protLeft === 0 ? 'text-slate-500' : 'text-amber-400'}`}>
                    {protLeft}g
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">Water left</p>
                  <p className={`font-bold text-lg ${totals.hydration_remaining === 0 ? 'text-slate-500' : 'text-blue-400'}`}>
                    {totals.hydration_remaining}oz
                  </p>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Hydration + Activity quick cards */}
      {totals && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/activity"
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 block"
          >
            <p className="text-xs text-slate-500 uppercase tracking-wider">Hydration</p>
            <p className="text-xl font-bold text-blue-400">{totals.hydration_oz}oz</p>
            <ProgressBar value={totals.hydration_oz} max={hydTarget} color="bg-blue-500" />
            <p className="text-xs text-slate-500">{hydTarget}oz target</p>
          </Link>

          <Link
            href="/activity"
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 block"
          >
            <p className="text-xs text-slate-500 uppercase tracking-wider">Activity</p>
            <p className="text-xl font-bold text-amber-400">{totals.activity_minutes}min</p>
            <ProgressBar
              value={totals.activity_minutes}
              max={totals.day_type === 'high-output' ? 90 : 45}
              color="bg-amber-500"
            />
            <p className="text-xs text-slate-500">
              {totals.calories_burned > 0
                ? `~${totals.calories_burned} cal burned`
                : totals.estimated_steps > 0
                  ? `~${totals.estimated_steps.toLocaleString()} steps`
                  : 'No activity logged'}
            </p>
          </Link>
        </div>
      )}

      {/* Steps card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Steps</p>
            <p className="text-xl font-bold text-emerald-400">
              {(totals?.estimated_steps ?? 0).toLocaleString()}
              <span className="text-slate-500 text-sm font-normal"> / {(settings.step_goal ?? 8000).toLocaleString()}</span>
            </p>
          </div>
          {(totals?.estimated_steps ?? 0) >= (settings.step_goal ?? 8000) && (
            <span className="text-xs text-emerald-400 font-semibold">Goal hit 🎉</span>
          )}
        </div>
        <ProgressBar
          value={totals?.estimated_steps ?? 0}
          max={settings.step_goal ?? 8000}
          color="bg-emerald-500"
        />
        {log?.manual_steps && (
          <p className="text-xs text-slate-500">From pedometer · tap to update</p>
        )}
        <div className="flex gap-2">
          <input
            type="number"
            value={stepInput}
            onChange={(e) => setStepInput(e.target.value)}
            placeholder="Enter pedometer reading..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button
            onClick={() => void handleSaveSteps()}
            disabled={!stepInput || savingSteps}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-medium transition-colors"
          >
            {savingSteps ? '...' : 'Log'}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { href: '/meals', icon: '🍽️', label: 'Meal' },
          { href: '/activity', icon: '💧', label: 'Water' },
          { href: '/activity', icon: '🏋️', label: 'Workout' },
          { href: '/check-in', icon: '📝', label: 'Check-In' },
        ].map(({ href, icon, label }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl py-3 hover:border-slate-700 transition-colors"
          >
            <span className="text-xl">{icon}</span>
            <span className="text-xs text-slate-400">{label}</span>
          </Link>
        ))}
      </div>

      {/* Today's Meals */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Today&apos;s Meals</h2>
          <Link href="/meals" className="text-emerald-400 text-sm hover:text-emerald-300">
            + Add
          </Link>
        </div>

        {meals.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No meals logged yet.{' '}
            <Link href="/meals" className="text-emerald-400 hover:underline">
              Add your first meal
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {meals.map((meal) => (
              <div key={meal.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{meal.meal_name}</p>
                    <p className="text-slate-500 text-xs mt-0.5 line-clamp-1">
                      {meal.ingredient_text}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">{meal.estimated_calories} cal</p>
                    <p className="text-xs text-slate-500">{meal.estimated_protein}g protein</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex gap-3 text-xs text-slate-600">
                    <span>{meal.estimated_carbs}g carbs</span>
                    <span>{meal.estimated_fat}g fat</span>
                  </div>
                  <button
                    onClick={() => void handleDeleteMeal(meal.id)}
                    className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
