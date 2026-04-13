import { supabase } from './supabase'
import type {
  ProcessedState,
  ManualRole,
  DailyCount,
  RunDigest,
  UserSettings,
  RoleStatus,
  ApplicationEntry,
  ApplicationStatus,
} from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function todayDate(): string {
  return new Date().toISOString().split('T')[0]
}

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// ── Processed State ───────────────────────────────────────────────────────────

export async function getProcessedStates(): Promise<ProcessedState[]> {
  const { data } = await supabase
    .from('processed_state')
    .select('*')
    .order('updated_at', { ascending: false })
  return (data ?? []) as ProcessedState[]
}

export async function getProcessedStateByKey(role_key: string): Promise<ProcessedState | null> {
  const { data } = await supabase
    .from('processed_state')
    .select('*')
    .eq('role_key', role_key)
    .maybeSingle()
  return data as ProcessedState | null
}

export async function getProcessedStateById(id: string): Promise<ProcessedState | null> {
  const { data } = await supabase
    .from('processed_state')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data as ProcessedState | null
}

export async function getTodayProcessedStates(): Promise<ProcessedState[]> {
  const today = todayDate()
  const { data } = await supabase
    .from('processed_state')
    .select('*')
    .eq('last_seen', today)
    .order('updated_at', { ascending: false })
  return (data ?? []) as ProcessedState[]
}

export async function getProcessedStatesByStatus(status: RoleStatus): Promise<ProcessedState[]> {
  const { data } = await supabase
    .from('processed_state')
    .select('*')
    .eq('status', status)
    .order('updated_at', { ascending: false })
  return (data ?? []) as ProcessedState[]
}

export async function saveProcessedState(state: Omit<ProcessedState, 'user_id'>): Promise<void> {
  const uid = await getUserId()
  if (!uid) return
  const now = new Date().toISOString()

  // Strip fields that may not exist in DB yet — try with them first, fall back without
  const payload = { ...state, user_id: uid, updated_at: now }
  const { error } = await supabase
    .from('processed_state')
    .upsert(payload, { onConflict: 'role_key,user_id' })

  if (error) {
    // Retry without strengths/gaps in case columns haven't been migrated yet
    const { strengths: _s, gaps: _g, ...safePayload } = payload as typeof payload & { strengths?: unknown; gaps?: unknown }
    const { error: retryError } = await supabase
      .from('processed_state')
      .upsert(safePayload, { onConflict: 'role_key,user_id' })
    if (retryError) {
      console.error('saveProcessedState error:', retryError)
    }
  }
}

export async function updateProcessedStatus(
  role_key: string,
  status: RoleStatus,
  extra?: Partial<ProcessedState>
): Promise<void> {
  const uid = await getUserId()
  if (!uid) return
  const now = new Date().toISOString()
  await supabase
    .from('processed_state')
    .update({ status, updated_at: now, ...extra })
    .eq('role_key', role_key)
    .eq('user_id', uid)
}

export async function deleteProcessedState(id: string): Promise<void> {
  await supabase.from('processed_state').delete().eq('id', id)
}

// ── Manual Roles ──────────────────────────────────────────────────────────────

export async function getManualRoles(): Promise<ManualRole[]> {
  const { data } = await supabase
    .from('manual_roles')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as ManualRole[]
}

export async function getPendingManualRoles(): Promise<ManualRole[]> {
  const { data } = await supabase
    .from('manual_roles')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return (data ?? []) as ManualRole[]
}

export async function saveManualRole(role: Omit<ManualRole, 'user_id'>): Promise<ManualRole> {
  const uid = await getUserId()
  if (!uid) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('manual_roles')
    .insert({ ...role, user_id: uid })
    .select()
    .single()
  if (error) throw error
  return data as ManualRole
}

export async function updateManualRoleStatus(
  id: string,
  status: ManualRole['status'],
  extra?: Partial<ManualRole>
): Promise<void> {
  await supabase
    .from('manual_roles')
    .update({ status, ...extra })
    .eq('id', id)
}

export async function deleteManualRole(id: string): Promise<void> {
  await supabase.from('manual_roles').delete().eq('id', id)
}

// ── Daily Counts ──────────────────────────────────────────────────────────────

export async function getDailyCount(date: string): Promise<DailyCount | null> {
  const { data } = await supabase
    .from('daily_counts')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  return data as DailyCount | null
}

export async function upsertDailyCount(date: string, patch: Partial<DailyCount>): Promise<void> {
  const uid = await getUserId()
  if (!uid) return
  const existing = await getDailyCount(date)
  const base: Partial<DailyCount> = existing ?? {
    id: generateId(),
    date,
    generated_count: 0,
    dropped_count: 0,
    scored_count: 0,
    needs_jd_count: 0,
    user_id: uid,
  }
  await supabase
    .from('daily_counts')
    .upsert({ ...base, ...patch, user_id: uid }, { onConflict: 'date,user_id' })
}

export async function incrementDailyCount(
  date: string,
  field: 'generated_count' | 'dropped_count' | 'scored_count' | 'needs_jd_count'
): Promise<void> {
  const current = await getDailyCount(date)
  const currentVal = current?.[field] ?? 0
  await upsertDailyCount(date, { [field]: currentVal + 1 })
}

// ── Run Digests ───────────────────────────────────────────────────────────────

export async function getRunDigests(): Promise<RunDigest[]> {
  const { data } = await supabase
    .from('run_digests')
    .select('*')
    .order('date', { ascending: false })
    .limit(30)
  return (data ?? []) as RunDigest[]
}

export async function getLatestDigest(): Promise<RunDigest | null> {
  const { data } = await supabase
    .from('run_digests')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as RunDigest | null
}

export async function saveRunDigest(digest: Omit<RunDigest, 'user_id'>): Promise<void> {
  const uid = await getUserId()
  if (!uid) return
  await supabase
    .from('run_digests')
    .upsert({ ...digest, user_id: uid }, { onConflict: 'date,user_id' })
}

// ── Settings ──────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Omit<UserSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  master_resume: '',
  fact_bank: '',
  daily_cap: 5,
  match_threshold: 55,
  target_titles: [],
  target_locations: [],
  excluded_terms: [],
}

export async function getSettings(): Promise<UserSettings> {
  const { data } = await supabase.from('user_settings').select('*').maybeSingle()
  if (!data) {
    const uid = await getUserId()
    return {
      ...DEFAULT_SETTINGS,
      id: generateId(),
      user_id: uid ?? '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }
  return data as UserSettings
}

export async function saveSettings(s: Partial<UserSettings>): Promise<void> {
  const uid = await getUserId()
  if (!uid) return
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { id: generateId(), ...s, user_id: uid, updated_at: now },
      { onConflict: 'user_id' }
    )
  if (error) throw new Error(`${error.message} (code: ${error.code})`)
}

// ── Application Tracker ───────────────────────────────────────────────────────

export async function getApplications(): Promise<ApplicationEntry[]> {
  const { data } = await supabase
    .from('application_tracker')
    .select('*')
    .order('updated_at', { ascending: false })
  return (data ?? []) as ApplicationEntry[]
}

export async function saveApplication(app: Omit<ApplicationEntry, 'user_id'>): Promise<void> {
  const uid = await getUserId()
  if (!uid) return
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('application_tracker')
    .upsert({ ...app, user_id: uid, updated_at: now }, { onConflict: 'id' })
  if (error) throw new Error(`${error.message} (code: ${error.code})`)
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
  extra?: Partial<ApplicationEntry>
): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('application_tracker')
    .update({ status, updated_at: now, ...extra })
    .eq('id', id)
}

export async function deleteApplication(id: string): Promise<void> {
  await supabase.from('application_tracker').delete().eq('id', id)
}
