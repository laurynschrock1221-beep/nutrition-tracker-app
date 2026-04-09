export interface DailyLog {
  id: string
  date: string // YYYY-MM-DD
  morning_weight?: number
  calorie_target_min: number
  calorie_target_max: number
  protein_target_min: number
  protein_target_max: number
  hydration_target_oz: number
  soreness_level: number // 0-5
  fatigue_level: number // 0-5
  period_flag: boolean
  restaurant_meal_flag: boolean
  notes?: string
  manual_steps?: number
}

export interface DraftMeal {
  id: string
  name: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  ingredient_list: string
  default_portions?: string
  estimated_calories: number
  estimated_protein: number
  estimated_carbs: number
  estimated_fat: number
  tags: string[]
  notes?: string
  favorite: boolean
  created_at: string
}

export interface LoggedMeal {
  id: string
  date: string // YYYY-MM-DD
  time: string
  linked_draft_meal_id?: string
  meal_name: string
  ingredient_text: string
  estimated_calories: number
  estimated_protein: number
  estimated_carbs: number
  estimated_fat: number
  notes?: string
}

export interface ActivityLog {
  id: string
  date: string
  activity_type: 'lifting' | 'boxing' | 'hiit' | 'walking' | 'treadmill' | 'chores' | 'hockey' | 'hiking' | 'sup' | 'other'
  minutes: number
  estimated_steps?: number
  estimated_calories_burned?: number
  intensity?: 'low' | 'moderate' | 'high'
  elevation_gain_ft?: number
  distance_miles?: number
  pr_flag?: boolean
  pr_notes?: string
  notes?: string
}

export interface HydrationLog {
  id: string
  date: string
  time: string
  ounces: number
}

export interface UserSettings {
  name?: string
  tdee?: number          // maintenance calories at reference weight
  calorie_target_min: number
  calorie_target_max: number
  protein_target_min: number
  protein_target_max: number
  carb_target_g?: number // baseline carbs in grams (moderate day)
  fat_target_g?: number  // baseline fat in grams (moderate day)
  hydration_target_oz: number
  step_goal: number
  weight_lbs?: number    // reference weight when TDEE was entered
  height_inches?: number
  current_bf_pct?: number  // body fat % at time of measurement
  goal_bf_pct?: number     // target body fat %
  bf_measured_date?: string // YYYY-MM-DD when bf was last measured
}

export interface GoalProgress {
  current_bf_pct: number       // as entered at measurement date
  goal_bf_pct: number
  lean_mass_lbs: number        // derived from measurement weight × (1 - bf%)
  current_fat_lbs: number      // weight × bf%
  fat_to_lose_lbs: number      // to reach goal while preserving lean mass
  goal_weight_lbs: number      // lean_mass / (1 - goal_bf%)
  estimated_bf_now?: number    // re-estimated from today's weight (assumes lean mass preserved)
  estimated_fat_remaining?: number  // fat left based on today's weight
  weeks_to_goal?: number       // at current avg deficit
  days_since_measured: number
}

export type DayType = 'rest' | 'moderate' | 'high-output'

export interface DayTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
  hydration_oz: number
  activity_minutes: number
  estimated_steps: number
  calories_burned: number
  day_type: DayType
  calories_remaining: number
  protein_remaining: number
  hydration_remaining: number
  recovery_flag: boolean
  retention_flag: boolean
  pr_today: boolean
}

export interface WeightPoint {
  date: string
  weight?: number
  rolling_avg?: number
}
