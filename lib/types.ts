export type RoleStatus = 'needs_jd' | 'dropped' | 'scored' | 'generated'
export type RoleSource = 'greenhouse' | 'linkedin' | 'builtin' | 'careers' | 'manual' | 'one_off'
export type ManualRoleStatus = 'pending' | 'processing' | 'generated' | 'failed'

export interface ProcessedState {
  id: string
  role_key: string
  status: RoleStatus
  reason?: string
  source: RoleSource
  company: string
  title: string
  location?: string
  url?: string
  jd_text?: string
  match?: boolean
  match_pct?: number
  cheap_score?: number
  salary_min?: number
  salary_max?: number
  output_file?: string
  resume_text?: string
  cover_letter_text?: string
  integrity_notes?: string
  strengths?: string[]
  gaps?: string[]
  ats_keywords_present?: string[]
  ats_keywords_missing?: string[]
  hard_filter_risk?: boolean
  hard_filter_reasons?: string[]
  last_seen: string
  today: boolean
  is_manual: boolean
  user_id: string
  created_at: string
  updated_at: string
}

export interface ManualRole {
  id: string
  company: string
  title: string
  location?: string
  jd_text: string
  status: ManualRoleStatus
  processed_at?: string
  role_key?: string
  error_msg?: string
  user_id: string
  created_at: string
}

export interface DailyCount {
  id: string
  date: string
  generated_count: number
  dropped_count: number
  scored_count: number
  needs_jd_count: number
  user_id: string
}

export interface RunDigest {
  id: string
  date: string
  digest_text: string
  metrics: DigestMetrics
  user_id: string
  created_at: string
}

export interface DigestMetrics {
  generated: number
  dropped: number
  needs_jd: number
  scored: number
  daily_cap: number
  sources: Record<string, number>
  drop_reasons: Record<string, number>
  generated_files: string[]
  recommendation: string
}

export interface UserSettings {
  id: string
  user_id: string
  master_resume: string
  fact_bank: string
  daily_cap: number
  match_threshold: number
  target_titles: string[]
  target_locations: string[]
  excluded_terms: string[]
  created_at: string
  updated_at: string
}

export interface ScoreResult {
  should_generate: boolean
  match_score: number
  match_pct: number
  drop_reason?: string
  strengths: string[]
  gaps: string[]
  hard_filter_risk?: boolean
  hard_filter_reasons?: string[]
}

export interface CheapScoreResult {
  score: number
  reason: string
  family: string
  penalized: boolean
}

export interface GenerateResult {
  resume_text: string
  output_file: string
  integrity_notes: string
  match_pct: number
}

export type ApplicationStatus =
  | 'applied'
  | 'no_response'
  | 'invited_interview'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export interface ApplicationEntry {
  id: string
  user_id: string
  company: string
  title: string
  status: ApplicationStatus
  applied_date?: string
  follow_up_date?: string
  contact_name?: string
  contact_email?: string
  job_url?: string
  notes?: string
  role_key?: string
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  todayGenerated: number
  todayDropped: number
  todayNeedsJd: number
  todayScored: number
  dailyCap: number
  recentDrafts: ProcessedState[]
  recommendation: string
  pendingManual: number
}
