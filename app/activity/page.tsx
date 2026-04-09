'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { WorkoutParseResult } from '@/app/api/parse-workout/route'
import {
  getActivityLogs,
  getHydrationLogs,
  saveActivityLog,
  saveHydrationLog,
  deleteActivityLog,
  deleteHydrationLog,
  getSettings,
  generateId,
  todayDate,
  DEFAULT_SETTINGS,
} from '@/lib/storage'
import { classifyDayType, estimateCaloriesBurned } from '@/lib/compute'
import type { ActivityLog, HydrationLog, UserSettings } from '@/lib/types'

const ACTIVITY_TYPES = [
  { type: 'lifting' as const, label: 'Lifting', icon: '🏋️', defaultSteps: 1500 },
  { type: 'boxing' as const, label: 'Boxing/HIIT', icon: '🥊', defaultSteps: 3000 },
  { type: 'hiit' as const, label: 'HIIT', icon: '🔥', defaultSteps: 2500 },
  { type: 'walking' as const, label: 'Walking', icon: '🚶', defaultSteps: 0 },
  { type: 'treadmill' as const, label: 'Treadmill', icon: '🏃', defaultSteps: 0 },
  { type: 'hockey' as const, label: 'Hockey (game)', icon: '🏒', defaultSteps: 4000 },
  { type: 'hiking' as const, label: 'Hiking', icon: '🥾', defaultSteps: 0 },
  { type: 'sup' as const, label: 'Paddleboarding', icon: '🏄', defaultSteps: 0 },
  { type: 'chores' as const, label: 'Chores / lifestyle', icon: '🏠', defaultSteps: 800 },
]

const WATER_QUICK = [8, 12, 16, 20, 24, 32]

function ProgressBar({ value, max, color = 'bg-emerald-500' }: { value: number; max: number; color?: string }) {
  const p = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0)
  return (
    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${p}%` }} />
    </div>
  )
}

export default function ActivityPage() {
  const [date] = useState(todayDate)
  const [mounted, setMounted] = useState(false)
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [hydration, setHydration] = useState<HydrationLog[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)

  const [showActivityForm, setShowActivityForm] = useState(false)
  const [actType, setActType] = useState<ActivityLog['activity_type']>('lifting')
  const [actMinutes, setActMinutes] = useState('45')
  const [actSteps, setActSteps] = useState('')
  const [actIntensity, setActIntensity] = useState<ActivityLog['intensity']>('moderate')
  const [actNotes, setActNotes] = useState('')
  const [actElevation, setActElevation] = useState('')
  const [actDistance, setActDistance] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<WorkoutParseResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const [customOz, setCustomOz] = useState('')

  const load = useCallback(async () => {
    const [acts, hyd, s] = await Promise.all([
      getActivityLogs(date),
      getHydrationLogs(date),
      getSettings(),
    ])
    setActivities(acts)
    setHydration(hyd)
    setSettings(s)
  }, [date])

  useEffect(() => {
    setMounted(true)
    void load()
  }, [load])

  const totalHydration = hydration.reduce((s, h) => s + h.ounces, 0)
  const totalActivityMin = activities.reduce((s, a) => s + a.minutes, 0)
  const totalSteps = activities.reduce((s, a) => s + (a.estimated_steps ?? 0), 0)
  const dayType = classifyDayType(activities)
  const hydrationTarget = settings.hydration_target_oz

  const previewCalories = estimateCaloriesBurned(
    actType,
    parseInt(actMinutes) || 0,
    actIntensity ?? 'moderate',
    settings.weight_lbs,
  )

  const handleImageImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const images = await Promise.all(
        files.map(async (file) => {
          const buffer = await file.arrayBuffer()
          return {
            imageBase64: Buffer.from(buffer).toString('base64'),
            mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          }
        }),
      )
      const res = await fetch('/api/parse-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      })
      const json = await res.json() as { data?: WorkoutParseResult; error?: string }
      if (!res.ok || !json.data) {
        setImportError(json.error ?? 'Could not read workout. Try a clearer screenshot.')
        return
      }
      const result = json.data
      setImportResult(result)
      setActType(result.activity_type)
      setActMinutes(result.minutes.toString())
      setActIntensity(result.intensity)
      setActNotes(result.summary)
      setShowActivityForm(true)
    } catch {
      setImportError('Something went wrong. Check your API key in .env.local.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleLogActivity = async () => {
    const selectedType = ACTIVITY_TYPES.find((t) => t.type === actType)
    const steps = actSteps
      ? parseInt(actSteps)
      : actType === 'walking'
        ? Math.round((parseInt(actMinutes) || 0) * 100)
        : actType === 'treadmill'
          ? Math.round((parseInt(actMinutes) || 0) * 110)
          : selectedType?.defaultSteps ?? 0

    const mins = parseInt(actMinutes) || 0
    const elevationFt = actType === 'hiking' ? parseInt(actElevation) || undefined : undefined
    const caloriesBurned = estimateCaloriesBurned(actType, mins, actIntensity ?? 'moderate', settings.weight_lbs, elevationFt)

    const log: ActivityLog = {
      id: generateId(),
      date,
      activity_type: actType,
      minutes: mins,
      estimated_steps: steps,
      estimated_calories_burned: caloriesBurned,
      intensity: actIntensity,
      elevation_gain_ft: elevationFt,
      distance_miles: actType === 'hiking' ? parseFloat(actDistance) || undefined : undefined,
      pr_flag: importResult?.is_pr,
      pr_notes: importResult?.pr_notes || undefined,
      notes: actNotes || undefined,
    }
    await saveActivityLog(log)
    void load()
    setShowActivityForm(false)
    setActNotes('')
    setActSteps('')
    setActElevation('')
    setActDistance('')
    setImportResult(null)
  }

  const handleAddWater = async (oz: number) => {
    const log: HydrationLog = {
      id: generateId(),
      date,
      time: new Date().toTimeString().slice(0, 5),
      ounces: oz,
    }
    await saveHydrationLog(log)
    void load()
    setCustomOz('')
  }

  const getDayTypeRecommendation = () => {
    const hydPace = totalHydration / Math.max(1, hydrationTarget)
    const hour = new Date().getHours()
    const dayFraction = hour / 24
    if (dayType === 'high-output' && totalActivityMin < 30) return 'High-output day planned. Make sure to fuel and hydrate before your session.'
    if (hydPace < dayFraction * 0.7) return `Hydration is behind pace. Add ${hydrationTarget - totalHydration}oz before end of day.`
    if (dayType === 'high-output' && totalActivityMin >= 60) return 'You already had a high-output day. No more structured cardio needed.'
    if (dayType === 'rest' && totalActivityMin < 20) return 'Rest day — light walking or chores is fine. No structured training needed.'
    if (totalSteps > 0 && totalSteps < (settings.step_goal ?? 8000) * 0.5) return 'Step count is low. A short walk could help hit your goal.'
    return 'Activity and hydration are on track.'
  }

  if (!mounted) return null

  const dayTypeMap = {
    rest: { label: 'Rest Day', cls: 'bg-slate-700 text-slate-300' },
    moderate: { label: 'Moderate Day', cls: 'bg-blue-900 text-blue-300' },
    'high-output': { label: 'High-Output Day', cls: 'bg-amber-900 text-amber-300' },
  }

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Activity & Hydration</h1>
          <p className="text-slate-400 text-sm">
            {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${dayTypeMap[dayType].cls}`}>
          {dayTypeMap[dayType].label}
        </span>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">Recommendation</p>
        <p className="text-sm leading-relaxed text-slate-200">{getDayTypeRecommendation()}</p>
      </div>

      {/* Hydration */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">💧 Hydration</h2>
          <div className="text-right">
            <span className="text-2xl font-bold text-blue-400">{totalHydration}oz</span>
            <span className="text-slate-500 text-sm"> / {hydrationTarget}oz</span>
          </div>
        </div>
        <ProgressBar value={totalHydration} max={hydrationTarget} color="bg-blue-500" />
        <div className="text-xs text-slate-500">
          {hydrationTarget - totalHydration > 0 ? `${hydrationTarget - totalHydration}oz remaining` : 'Target reached! 🎉'}
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-2">Quick add</p>
          <div className="grid grid-cols-3 gap-2">
            {WATER_QUICK.map((oz) => (
              <button key={oz} onClick={() => void handleAddWater(oz)}
                className="bg-slate-800 hover:bg-blue-900/40 hover:border-blue-700 border border-slate-700 text-sm py-2.5 rounded-xl transition-colors font-medium">
                {oz}oz
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <input type="number" value={customOz} onChange={(e) => setCustomOz(e.target.value)} placeholder="Custom oz..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
          <button onClick={() => customOz && void handleAddWater(parseInt(customOz))} disabled={!customOz}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-medium transition-colors">
            Add
          </button>
        </div>
        {hydration.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-slate-800">
            {[...hydration].reverse().map((h) => (
              <div key={h.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-slate-300">{h.time} — <span className="font-medium">{h.ounces}oz</span></span>
                <button onClick={async () => { await deleteHydrationLog(h.id); void load() }}
                  className="text-xs bg-red-900/30 text-red-400 hover:bg-red-900/60 px-2.5 py-1 rounded-lg transition-colors font-medium">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">⚡ Activity</h2>
          <div className="text-right">
            <span className="text-2xl font-bold text-amber-400">{totalActivityMin}min</span>
          </div>
        </div>
        {totalSteps > 0 && <p className="text-xs text-slate-500">~{totalSteps.toLocaleString()} estimated steps</p>}

        {!showActivityForm && (
          <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageImport} />
            <button onClick={() => fileInputRef.current?.click()} disabled={importing}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 border-dashed rounded-xl py-3 text-sm text-slate-300 transition-colors">
              {importing ? (<><span className="animate-spin inline-block">⏳</span>Reading your workout...</>) : (<><span>📸</span>Import from screenshots (select multiple)</>)}
            </button>
            {importResult && (
              <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-amber-400 font-medium uppercase tracking-wider">Imported — review below</p>
                  {importResult.is_pr && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-2 py-0.5 rounded-full font-medium">🏆 PR Day</span>
                  )}
                </div>
                <p className="text-sm text-slate-200">{importResult.summary}</p>
                {importResult.is_pr && importResult.pr_notes && <p className="text-xs text-yellow-300">{importResult.pr_notes}</p>}
                <div className="flex gap-3 text-xs text-slate-400">
                  <span>~{previewCalories} cal burned</span>
                  <span>{importResult.minutes} min</span>
                </div>
                {importResult.exercises.length > 0 && <p className="text-xs text-slate-500">{importResult.exercises.join(' · ')}</p>}
              </div>
            )}
            {importError && (
              <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-3">
                <p className="text-xs text-red-400">{importError}</p>
              </div>
            )}
          </div>
        )}

        {!showActivityForm && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Or pick manually</p>
            <div className="grid grid-cols-3 gap-2">
              {ACTIVITY_TYPES.map((a) => (
                <button key={a.type}
                  onClick={() => {
                    setActType(a.type)
                    setActMinutes(a.type === 'walking' ? '30' : a.type === 'chores' ? '60' : a.type === 'hockey' ? '60' : a.type === 'hiking' ? '120' : a.type === 'sup' ? '60' : '45')
                    setActElevation('')
                    setActDistance('')
                    setShowActivityForm(true)
                  }}
                  className="flex flex-col items-center gap-1 bg-slate-800 hover:bg-amber-900/20 hover:border-amber-800 border border-slate-700 py-3 rounded-xl transition-colors">
                  <span className="text-xl">{a.icon}</span>
                  <span className="text-xs text-slate-400 text-center leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {showActivityForm && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium capitalize">
                {ACTIVITY_TYPES.find((a) => a.type === actType)?.icon}{' '}
                {ACTIVITY_TYPES.find((a) => a.type === actType)?.label}
              </p>
              <button onClick={() => setShowActivityForm(false)} className="text-slate-500 hover:text-white text-sm">← Change</button>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Duration (minutes)</label>
              <input type="number" value={actMinutes} onChange={(e) => setActMinutes(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-base font-bold focus:outline-none focus:border-amber-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Intensity</label>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'moderate', 'high'] as const).map((level) => (
                  <button key={level} onClick={() => setActIntensity(level)}
                    className={`py-2 rounded-lg text-sm capitalize transition-all ${actIntensity === level ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    {level}
                  </button>
                ))}
              </div>
            </div>
            {(actType === 'walking' || actType === 'treadmill') && (
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Steps (optional — auto-estimated if blank)</label>
                <input type="number" value={actSteps} onChange={(e) => setActSteps(e.target.value)}
                  placeholder={actType === 'walking' ? 'e.g. 3500' : 'e.g. 4000'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500" />
              </div>
            )}

            {actType === 'hiking' && (
              <div className="space-y-3 bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                <p className="text-xs text-amber-400 font-medium">Hiking details — both affect calorie burn</p>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Elevation gain (feet)</label>
                  <input type="number" value={actElevation} onChange={(e) => setActElevation(e.target.value)}
                    placeholder="e.g. 1200"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500" />
                  <p className="text-xs text-slate-600">Adds ~1 cal/kg per 100m climbed on top of base burn</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Distance (miles, optional)</label>
                  <input type="number" step="0.1" value={actDistance} onChange={(e) => setActDistance(e.target.value)}
                    placeholder="e.g. 4.5"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500" />
                  <p className="text-xs text-slate-600">Logged for your records</p>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Notes (optional)</label>
              <input type="text" value={actNotes} onChange={(e) => setActNotes(e.target.value)}
                placeholder="e.g. leg day, upper body, morning walk..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowActivityForm(false)} className="flex-1 bg-slate-800 text-slate-400 py-3 rounded-xl text-sm">Cancel</button>
              <button onClick={() => void handleLogActivity()} disabled={!actMinutes}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors">
                Log Activity
              </button>
            </div>
          </div>
        )}

        {activities.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-slate-800">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Logged</p>
            {activities.map((a) => {
              const info = ACTIVITY_TYPES.find((t) => t.type === a.activity_type)
              return (
                <div key={a.id} className="py-2 border-b border-slate-800/50 last:border-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{info?.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium capitalize">{info?.label ?? a.activity_type}</p>
                          {a.pr_flag && <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-1.5 py-0 rounded-full">🏆 PR</span>}
                        </div>
                        {a.pr_notes && <p className="text-xs text-yellow-300/80">{a.pr_notes}</p>}
                        {a.notes && !a.pr_notes && <p className="text-xs text-slate-500 truncate">{a.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-medium">{a.minutes}min</p>
                        {a.estimated_calories_burned ? (
                          <p className="text-xs text-amber-400">~{a.estimated_calories_burned} net cal</p>
                        ) : a.estimated_steps ? (
                          <p className="text-xs text-slate-500">~{a.estimated_steps.toLocaleString()} steps</p>
                        ) : null}
                      </div>
                      <button onClick={async () => { await deleteActivityLog(a.id); void load() }}
                        className="text-xs bg-red-900/30 text-red-400 hover:bg-red-900/60 px-2.5 py-1 rounded-lg transition-colors font-medium">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
