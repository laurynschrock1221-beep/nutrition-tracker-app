'use client'

import { useEffect, useState } from 'react'
import { getProcessedStates, deleteProcessedState } from '@/lib/storage'
import type { ProcessedState, RoleStatus } from '@/lib/types'

const STATUS_LABELS: Record<RoleStatus, string> = {
  generated: 'Generated',
  scored: 'Scored',
  dropped: 'Dropped',
  needs_jd: 'Needs JD',
}

const STATUS_COLORS: Record<RoleStatus, string> = {
  generated: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  scored: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  dropped: 'bg-red-500/20 text-red-400 border border-red-500/30',
  needs_jd: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
}

const ALL_STATUSES: RoleStatus[] = ['generated', 'scored', 'dropped', 'needs_jd']

export default function CandidatesPage() {
  const [roles, setRoles] = useState<ProcessedState[]>([])
  const [filter, setFilter] = useState<RoleStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProcessedStates().then((data) => {
      setRoles(data)
      setLoading(false)
    })
  }, [])

  async function handleDelete(id: string) {
    await deleteProcessedState(id)
    setRoles((prev) => prev.filter((r) => r.id !== id))
  }

  const filtered = roles.filter((r) => {
    const matchStatus = filter === 'all' || r.status === filter
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      r.title.toLowerCase().includes(q) ||
      r.company.toLowerCase().includes(q) ||
      (r.location ?? '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  const counts: Record<string, number> = {}
  for (const r of roles) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Candidates</h1>
        <p className="text-slate-500 text-sm mt-0.5">{roles.length} total roles tracked</p>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by title, company, or location..."
        className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
      />

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <FilterChip
          label={`All (${roles.length})`}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {ALL_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={`${STATUS_LABELS[s]} (${counts[s] ?? 0})`}
            active={filter === s}
            onClick={() => setFilter(s)}
          />
        ))}
      </div>

      {/* Role list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 text-sm">
            {roles.length === 0
              ? 'No candidates yet. Generate a draft from a manual role to get started.'
              : 'No candidates match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((role) => (
            <CandidateCard
              key={role.id}
              role={role}
              isExpanded={expanded === role.id}
              onToggle={() => setExpanded(expanded === role.id ? null : role.id)}
              onDelete={() => handleDelete(role.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? 'bg-indigo-600 border-indigo-500 text-white'
          : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function CandidateCard({
  role,
  isExpanded,
  onToggle,
  onDelete,
}: {
  role: ProcessedState
  isExpanded: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-start gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white text-sm font-medium">{role.title}</p>
            {role.is_manual && (
              <span className="text-[10px] text-indigo-400 border border-indigo-500/40 px-1.5 py-0.5 rounded-full">
                manual
              </span>
            )}
          </div>
          <p className="text-slate-400 text-xs mt-0.5">
            {role.company}
            {role.location ? ` · ${role.location}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[role.status]}`}
          >
            {STATUS_LABELS[role.status]}
          </span>
          {role.match_pct !== undefined && (
            <span className="text-xs text-slate-400">{role.match_pct}%</span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-700 pt-3 space-y-3">
          {/* Meta row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <MetaItem label="Source" value={role.source} />
            <MetaItem label="Last seen" value={role.last_seen} />
            {role.cheap_score !== undefined && (
              <MetaItem label="Cheap score" value={String(role.cheap_score)} />
            )}
            {role.match_pct !== undefined && (
              <MetaItem label="AI match" value={`${role.match_pct}%`} />
            )}
          </div>

          {/* Drop reason */}
          {role.reason && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              <p className="text-red-400 text-xs">Drop reason: {role.reason}</p>
            </div>
          )}

          {/* Integrity notes */}
          {role.integrity_notes && (
            <div className="rounded-lg bg-slate-900 px-3 py-2">
              <p className="text-slate-400 text-xs">{role.integrity_notes}</p>
            </div>
          )}

          {/* JD preview */}
          {role.jd_text && (
            <details className="group">
              <summary className="text-xs text-indigo-400 cursor-pointer hover:text-indigo-300">
                Show JD preview
              </summary>
              <p className="text-slate-500 text-xs mt-2 whitespace-pre-wrap line-clamp-10 font-mono">
                {role.jd_text.slice(0, 500)}
                {role.jd_text.length > 500 ? '...' : ''}
              </p>
            </details>
          )}

          <button
            onClick={onDelete}
            className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            Remove record
          </button>
        </div>
      )}
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="text-slate-300">{value}</p>
    </div>
  )
}
