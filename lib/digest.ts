import type { DigestMetrics, ProcessedState } from './types'

export function buildDigestText(date: string, metrics: DigestMetrics): string {
  const lines: string[] = []

  lines.push(`═══════════════════════════════════════`)
  lines.push(`  RESUME DRAFTER — DAILY DIGEST`)
  lines.push(`  ${date}`)
  lines.push(`═══════════════════════════════════════`)
  lines.push('')

  lines.push(`RUN SUMMARY`)
  lines.push(`  Generated:    ${metrics.generated} / ${metrics.daily_cap} cap`)
  lines.push(`  Scored:       ${metrics.scored}`)
  lines.push(`  Dropped:      ${metrics.dropped}`)
  lines.push(`  Needs JD:     ${metrics.needs_jd}`)
  lines.push('')

  lines.push(`RECOMMENDATION`)
  lines.push(`  ${metrics.recommendation}`)
  lines.push('')

  if (metrics.generated_files.length > 0) {
    lines.push(`GENERATED DRAFTS`)
    for (const f of metrics.generated_files) {
      lines.push(`  • ${f}`)
    }
    lines.push('')
  }

  if (Object.keys(metrics.sources).length > 0) {
    lines.push(`CANDIDATE SOURCES`)
    for (const [src, count] of Object.entries(metrics.sources)) {
      lines.push(`  ${src}: ${count}`)
    }
    lines.push('')
  }

  if (Object.keys(metrics.drop_reasons).length > 0) {
    lines.push(`DROP REASONS`)
    for (const [reason, count] of Object.entries(metrics.drop_reasons)) {
      lines.push(`  ${reason}: ${count}`)
    }
    lines.push('')
  }

  lines.push(`═══════════════════════════════════════`)

  return lines.join('\n')
}

export function buildRecommendation(metrics: Omit<DigestMetrics, 'recommendation'>): string {
  const { generated, dropped, needs_jd, scored, daily_cap } = metrics

  if (generated === 0 && scored === 0 && dropped === 0 && needs_jd === 0) {
    return 'No roles processed today. Add candidates or paste a JD manually to get started.'
  }

  if (generated === 0 && needs_jd > 0) {
    return `No drafts generated. ${needs_jd} role(s) are missing JDs — try pasting them manually.`
  }

  if (generated === 0 && dropped > 0 && scored === 0) {
    return 'All roles were filtered out before AI scoring. Cheap scorer may be too restrictive, or sources are noisy.'
  }

  if (generated === 0 && scored > 0) {
    return `${scored} role(s) were scored but none met the match threshold. Consider lowering the threshold or reviewing the roles.`
  }

  if (generated >= daily_cap) {
    return `Daily cap reached (${daily_cap} generated). Review and download your outputs.`
  }

  if (generated > 0 && generated < daily_cap) {
    return `${generated} draft(s) generated. Download outputs from the Drafts tab.`
  }

  return 'Run completed. Review the Digest for details.'
}

export function countDropReasons(states: ProcessedState[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of states) {
    if (s.status === 'dropped' && s.reason) {
      counts[s.reason] = (counts[s.reason] ?? 0) + 1
    }
  }
  return counts
}

export function countSources(states: ProcessedState[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of states) {
    counts[s.source] = (counts[s.source] ?? 0) + 1
  }
  return counts
}
