import type {
  DailyLog,
  LoggedMeal,
  ActivityLog,
  HydrationLog,
  DayTotals,
  DayType,
  WeightPoint,
} from './types'

export type { ActivityLog }

// ── Day totals ────────────────────────────────────────────────────────────────

export function computeDayTotals(
  log: DailyLog | null,
  meals: LoggedMeal[],
  activities: ActivityLog[],
  hydration: HydrationLog[],
  defaults: { calorie_target_min: number; calorie_target_max: number; protein_target_min: number; protein_target_max: number; hydration_target_oz: number },
): DayTotals {
  const calories = meals.reduce((s, m) => s + m.estimated_calories, 0)
  const protein = meals.reduce((s, m) => s + m.estimated_protein, 0)
  const carbs = meals.reduce((s, m) => s + m.estimated_carbs, 0)
  const fat = meals.reduce((s, m) => s + m.estimated_fat, 0)
  const hydration_oz = hydration.reduce((s, h) => s + h.ounces, 0)

  const activity_minutes = activities.reduce((s, a) => s + a.minutes, 0)
  const activity_steps = activities.reduce((s, a) => s + (a.estimated_steps ?? 0), 0)
  // If a pedometer reading was manually entered, use it as the day total (it's more accurate)
  const estimated_steps = log?.manual_steps ?? activity_steps
  const calories_burned = activities.reduce((s, a) => s + (a.estimated_calories_burned ?? 0), 0)
  const pr_today = activities.some((a) => a.pr_flag)

  const calorie_target_min = log?.calorie_target_min ?? defaults.calorie_target_min
  const calorie_target_max = log?.calorie_target_max ?? defaults.calorie_target_max
  const protein_target_min = log?.protein_target_min ?? defaults.protein_target_min
  const hydration_target_oz = log?.hydration_target_oz ?? defaults.hydration_target_oz

  const day_type = classifyDayType(activities)

  const recovery_flag =
    (log?.fatigue_level ?? 0) >= 4 ||
    (log?.soreness_level ?? 0) >= 4

  const retention_flag = checkRetentionFlag(log, activities, meals)

  return {
    calories,
    protein,
    carbs,
    fat,
    hydration_oz,
    activity_minutes,
    estimated_steps,
    calories_burned,
    day_type,
    calories_remaining: Math.max(0, calorie_target_min - calories),
    protein_remaining: Math.max(0, protein_target_min - protein),
    hydration_remaining: Math.max(0, hydration_target_oz - hydration_oz),
    recovery_flag,
    retention_flag,
    pr_today,
  }
}

// ── Day type classification ───────────────────────────────────────────────────

export function classifyDayType(activities: ActivityLog[]): DayType {
  const hasLifting = activities.some((a) => a.activity_type === 'lifting')
  const hasBoxing = activities.some((a) => a.activity_type === 'boxing')
  const hasHiit = activities.some((a) => a.activity_type === 'hiit')
  const totalStructured = activities
    .filter((a) => ['lifting', 'boxing', 'hiit'].includes(a.activity_type))
    .reduce((s, a) => s + a.minutes, 0)

  if (hasBoxing || hasHiit || (hasLifting && totalStructured >= 60)) return 'high-output'
  if (hasLifting || totalStructured >= 30) return 'moderate'
  return 'rest'
}

// ── Retention flag ────────────────────────────────────────────────────────────

function checkRetentionFlag(
  log: DailyLog | null,
  activities: ActivityLog[],
  meals: LoggedMeal[],
): boolean {
  if (!log) return false
  if (log.period_flag) return true
  if (log.restaurant_meal_flag) return true
  if ((log.soreness_level ?? 0) >= 3) return true
  const hasLegDay = activities.some(
    (a) => a.activity_type === 'lifting' && a.notes?.toLowerCase().includes('leg'),
  )
  if (hasLegDay) return true
  const totalCarbs = meals.reduce((s, m) => s + m.estimated_carbs, 0)
  if (totalCarbs > 200) return true
  return false
}

// ── Recommendation engine ─────────────────────────────────────────────────────

export function getDayRecommendation(totals: DayTotals, log: DailyLog | null): string {
  const { calories, protein, hydration_oz, day_type, recovery_flag } = totals
  const calMin = log?.calorie_target_min ?? 1400
  const calMax = log?.calorie_target_max ?? 1600
  const proMin = log?.protein_target_min ?? 120
  const hydTarget = log?.hydration_target_oz ?? 80

  if (recovery_flag) {
    return 'Fatigue or soreness is high. Prioritize rest, protein, and hydration today.'
  }
  if (protein < proMin * 0.5) {
    return 'Protein is very low. Make your next meal protein-focused.'
  }
  if (hydration_oz < hydTarget * 0.4) {
    const remaining = Math.round(hydTarget - hydration_oz)
    return `Hydration is behind pace. Add ${remaining} oz before end of day.`
  }
  if (day_type === 'high-output' && calories < calMin * 0.6) {
    return 'High-output day with low intake. Add 20–30g carbs and lean protein now.'
  }
  if (log?.restaurant_meal_flag && calories < calMin * 0.5) {
    return 'Dinner out planned. Keep lunch lean so you have room for the meal.'
  }
  if (protein < proMin * 0.75) {
    return 'Protein is low. Prioritize lean protein at your next meal.'
  }
  if (calories > calMax) {
    return `Calories are over target by ${Math.round(calories - calMax)}. Keep the rest of the day light.`
  }
  if (day_type === 'rest' && calories < calMin * 0.8) {
    return `Rest day — ${Math.round(calMin - calories)} calories remaining. Lean protein and veggies.`
  }
  if (hydration_oz >= hydTarget) {
    return 'Hydration is on track. Great work today.'
  }
  return `On track. ${Math.round(calMin - calories)} cal and ${Math.round(proMin - protein)}g protein remaining.`
}

// ── Weight trend ──────────────────────────────────────────────────────────────

export function buildWeightTrend(logs: DailyLog[], days = 14): WeightPoint[] {
  const sorted = [...logs]
    .filter((l) => l.morning_weight != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)

  return sorted.map((log, i) => {
    const window = sorted.slice(Math.max(0, i - 6), i + 1)
    const weights = window.map((w) => w.morning_weight!)
    const rolling_avg = weights.reduce((s, w) => s + w, 0) / weights.length
    return {
      date: log.date,
      weight: log.morning_weight,
      rolling_avg: Math.round(rolling_avg * 10) / 10,
    }
  })
}

// ── Weekly averages ───────────────────────────────────────────────────────────

export interface WeeklyStats {
  avg_calories: number
  avg_protein: number
  avg_weight?: number
  avg_calories_burned: number  // avg net calories burned from activity per logged day
  effective_tdee: number       // TDEE adjusted for current weight (or base if no weight data)
  est_deficit: number          // (effective_tdee + avg_calories_burned) - avg_calories
  adjusted_tdee?: number       // set only when weight has drifted from reference weight
}

export function computeWeeklyStats(
  logs: DailyLog[],
  allMeals: LoggedMeal[],
  settings?: { tdee?: number; weight_lbs?: number },
  allActivities?: ActivityLog[],
): WeeklyStats {
  const last7 = getLastNDays(7)
  const weekLogs = logs.filter((l) => last7.includes(l.date))

  const weekMeals = allMeals.filter((m) => last7.includes(m.date))
  const calsByDay = groupByDate(weekMeals.map((m) => ({ date: m.date, val: m.estimated_calories })))
  const protByDay = groupByDate(weekMeals.map((m) => ({ date: m.date, val: m.estimated_protein })))

  const calDays = Object.values(calsByDay)
  const protDays = Object.values(protByDay)

  const avg_calories = calDays.length
    ? Math.round(calDays.reduce((s, v) => s + v, 0) / calDays.length)
    : 0
  const avg_protein = protDays.length
    ? Math.round(protDays.reduce((s, v) => s + v, 0) / protDays.length)
    : 0

  const weights = weekLogs.map((l) => l.morning_weight).filter(Boolean) as number[]
  const avg_weight = weights.length
    ? Math.round((weights.reduce((s, w) => s + w, 0) / weights.length) * 10) / 10
    : undefined

  const baseTdee = settings?.tdee ?? 1800
  const refWeight = settings?.weight_lbs

  // Scale TDEE proportionally to current weight vs reference weight.
  // If someone loses 10 lbs from their reference, their maintenance drops proportionally.
  let adjusted_tdee: number | undefined
  if (settings?.tdee && refWeight && avg_weight && Math.abs(avg_weight - refWeight) >= 1) {
    adjusted_tdee = Math.round(settings.tdee * (avg_weight / refWeight))
  }

  // Average daily calories burned from logged activities over the past 7 days.
  // These are net calories (resting rate already subtracted in estimateCaloriesBurned),
  // so they add directly on top of the sedentary TDEE.
  const weekActivities = (allActivities ?? []).filter((a) => last7.includes(a.date))
  const burnByDay = groupByDate(
    weekActivities.map((a) => ({ date: a.date, val: a.estimated_calories_burned ?? 0 }))
  )
  const burnDays = Object.values(burnByDay)
  const avg_calories_burned = burnDays.length
    ? Math.round(burnDays.reduce((s, v) => s + v, 0) / burnDays.length)
    : 0

  const effective_tdee = adjusted_tdee ?? baseTdee
  // Total expenditure = sedentary TDEE + activity burn. Deficit = that minus intake.
  const est_deficit = avg_calories > 0 ? Math.round(effective_tdee + avg_calories_burned - avg_calories) : 0

  return { avg_calories, avg_protein, avg_weight, avg_calories_burned, effective_tdee, est_deficit, adjusted_tdee }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    return d.toISOString().split('T')[0]
  })
}

function groupByDate(items: { date: string; val: number }[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, { date, val }) => {
    acc[date] = (acc[date] ?? 0) + val
    return acc
  }, {})
}

// ── Goal progress ─────────────────────────────────────────────────────────────

export function computeGoalProgress(
  settings: {
    current_bf_pct?: number
    goal_bf_pct?: number
    weight_lbs?: number
    bf_measured_date?: string
    tdee?: number
  },
  currentWeightLbs?: number,
  avgDailyDeficit?: number, // positive = deficit, negative = surplus
): import('./types').GoalProgress | null {
  const { current_bf_pct, goal_bf_pct, weight_lbs, bf_measured_date } = settings
  if (!current_bf_pct || !goal_bf_pct || !weight_lbs) return null

  const refWeight = weight_lbs
  const currentBf = current_bf_pct / 100
  const goalBf = goal_bf_pct / 100

  const lean_mass_lbs = Math.round(refWeight * (1 - currentBf) * 10) / 10
  const current_fat_lbs = Math.round(refWeight * currentBf * 10) / 10
  const goal_weight_lbs = Math.round((lean_mass_lbs / (1 - goalBf)) * 10) / 10
  const fat_to_lose_lbs = Math.round((refWeight - goal_weight_lbs) * 10) / 10

  const days_since_measured = bf_measured_date
    ? Math.floor((Date.now() - new Date(bf_measured_date + 'T12:00:00').getTime()) / 86_400_000)
    : 0

  // If we have today's weight, estimate current BF% assuming lean mass is preserved
  let estimated_bf_now: number | undefined
  let estimated_fat_remaining: number | undefined
  if (currentWeightLbs && currentWeightLbs !== refWeight) {
    const estimatedFatNow = currentWeightLbs - lean_mass_lbs
    estimated_bf_now = Math.round((estimatedFatNow / currentWeightLbs) * 1000) / 10
    estimated_fat_remaining = Math.round(Math.max(0, estimatedFatNow - goal_weight_lbs * goalBf) * 10) / 10
  }

  // Weeks to goal at current deficit (1 lb fat ≈ 3500 cal)
  let weeks_to_goal: number | undefined
  if (avgDailyDeficit && avgDailyDeficit > 0) {
    const fatLeft = estimated_fat_remaining ?? fat_to_lose_lbs
    const daysNeeded = (fatLeft * 3500) / avgDailyDeficit
    weeks_to_goal = Math.round(daysNeeded / 7)
  }

  return {
    current_bf_pct,
    goal_bf_pct,
    lean_mass_lbs,
    current_fat_lbs,
    fat_to_lose_lbs,
    goal_weight_lbs,
    estimated_bf_now,
    estimated_fat_remaining,
    weeks_to_goal,
    days_since_measured,
  }
}

// ── Day-type macro targets ────────────────────────────────────────────────────
//
// Adjusts carb, protein, and fat targets based on training load.
// Carbs scale the most — they're the primary performance fuel.
// Protein bumps slightly on high-output days for recovery.
// Fat fills remaining calories after carbs + protein are placed.

export interface MacroTargets {
  caloriesMax: number
  caloriesMin: number
  protein: number
  carbs: number
  fat: number
  adjusted: boolean // true when day type has changed targets from baseline
}

export function getTargetsForDayType(
  dayType: DayType,
  calMax: number,
  calMin: number,
  proTargetMin: number,
  baseCarbG?: number,
  baseFatG?: number,
): MacroTargets {
  // On high-output days, total calories bump 15% — more fuel needed.
  // Rest days stay at baseline (under-eating on rest is fine; over-restricting isn't).
  const calMultiplier = dayType === 'high-output' ? 1.15 : 1.0
  const proMultiplier = dayType === 'high-output' ? 1.1 : 1.0
  const carbMultiplier =
    dayType === 'high-output' ? 1.3 : dayType === 'rest' ? 0.75 : 1.0
  const adjusted = dayType !== 'moderate'

  const caloriesMax = Math.round(calMax * calMultiplier)
  const caloriesMin = Math.round(calMin * calMultiplier)
  const protein = Math.round(proTargetMin * proMultiplier)

  // Carbs: use user's baseline if set, otherwise derive from calorie percentage
  const baseCarbs = baseCarbG ?? Math.round((caloriesMax * 0.40) / 4)
  const carbs = Math.round(baseCarbs * carbMultiplier)

  // Fat: use user's baseline (scaled same as carbs) if set, otherwise fill remaining calories.
  // If the user set a fat target, scale it inversely to carb changes so total cals stay consistent.
  const fat = baseFatG
    ? Math.max(20, Math.round(baseFatG * (dayType === 'rest' ? 1.15 : dayType === 'high-output' ? 0.85 : 1.0)))
    : Math.max(20, Math.round((caloriesMax - carbs * 4 - protein * 4) / 9))

  return { caloriesMax, caloriesMin, protein, carbs, fat, adjusted }
}

// ── Calorie burn estimator ────────────────────────────────────────────────────
//
// Uses NET calories: (MET - 1) × weight_kg × hours
// Subtracting 1 MET removes the calories you'd burn at rest anyway,
// giving a truer picture of what the workout itself contributed.
//
// Lifting METs are set conservatively because a typical session is ~30-40%
// active work — the rest is setup, rest periods, and transitions.

const MET_TABLE: Record<string, { low: number; moderate: number; high: number }> = {
  lifting:  { low: 3.0, moderate: 4.0, high: 5.0 },
  boxing:   { low: 6.0, moderate: 8.0, high: 10.0 },
  hiit:     { low: 6.0, moderate: 9.0, high: 11.0 },
  walking:  { low: 2.5, moderate: 3.5, high: 5.0 },
  treadmill:{ low: 6.0, moderate: 8.0, high: 10.0 },
  chores:   { low: 2.0, moderate: 3.0, high: 3.5 },
  // Hockey game MET is high — skating hard with bursts of intensity
  hockey:   { low: 6.0, moderate: 8.0, high: 10.0 },
  // Hiking base MET — elevation bonus added separately via elevation_gain_ft
  hiking:   { low: 4.0, moderate: 5.5, high: 7.0 },
  // Stand-up paddleboarding: upper body + balance work
  sup:      { low: 3.5, moderate: 6.0, high: 8.0 },
  other:    { low: 3.5, moderate: 5.0, high: 7.0 },
}

export function estimateCaloriesBurned(
  activityType: string,
  minutes: number,
  intensity: 'low' | 'moderate' | 'high' = 'moderate',
  weightLbs: number = 150,
  elevationGainFt?: number,
): number {
  const mets = MET_TABLE[activityType] ?? MET_TABLE['other']
  const grossMet = mets[intensity]
  const netMet = Math.max(0, grossMet - 1) // subtract resting metabolic rate
  const weightKg = weightLbs / 2.205
  const hours = minutes / 60
  const base = Math.round(netMet * weightKg * hours)

  // Elevation bonus for hiking: ~1 cal per kg per 100m gained (standard climbing formula)
  // Converts ft → m, then applies weight-scaled formula
  let elevationBonus = 0
  if (activityType === 'hiking' && elevationGainFt && elevationGainFt > 0) {
    const elevationM = elevationGainFt * 0.3048
    elevationBonus = Math.round(weightKg * (elevationM / 100))
  }

  return base + elevationBonus
}

// ── Format helpers ────────────────────────────────────────────────────────────

export function fmtDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function pct(value: number, target: number): number {
  if (target === 0) return 0
  return Math.min(100, Math.round((value / target) * 100))
}
