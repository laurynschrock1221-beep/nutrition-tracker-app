import type { CheapScoreResult } from './types'

// Role family keyword maps
const STRONG_FIT: Record<string, string[]> = {
  'operations': ['operations', 'ops', 'operational'],
  'program_coordination': ['program manager', 'project manager', 'project coordinator', 'program coordinator', 'implementation manager', 'delivery manager', 'customer success manager'],
  'implementation': ['implementation', 'onboarding', 'deployment', 'launch', 'rollout', 'integration manager'],
  'business_systems': ['business systems', 'crm', 'salesforce', 'systems analyst', 'business analyst', 'salesforce admin', 'salesforce administrator'],
  'revops': ['revenue operations', 'revops', 'sales operations', 'sales ops', 'gtm', 'go-to-market operations', 'marketing operations'],
  'contract_ops': ['contract manager', 'contract operations', 'contract administrator', 'contracts manager', 'contract specialist'],
  'change_management': ['change management', 'process improvement', 'workflow', 'process optimization', 'organizational change', 'transformation'],
  'compliance_regulatory': ['compliance', 'regulatory', 'compliance manager', 'compliance specialist', 'compliance coordinator', 'compliance analyst', 'compliance officer', 'regulatory affairs', 'regulatory compliance', 'regulatory operations', 'governance', 'risk and compliance', 'policy compliance'],
  'nonprofit_admin': ['nonprofit', 'non-profit', 'association management', 'membership operations', 'development operations', 'grants management', 'fund development'],
}

const PENALIZED: Record<string, string[]> = {
  'engineering': ['software engineer', 'software developer', 'frontend engineer', 'backend engineer', 'full stack engineer', 'ml engineer', 'data engineer', 'devops engineer', 'site reliability'],
  'design': ['ux designer', 'ui designer', 'product designer', 'graphic designer', 'visual designer'],
  'sales_ic': ['account executive', 'sales representative', 'quota', 'closing deals', 'sales target', 'commission-based'],
  'legal': ['attorney', 'counsel', 'lawyer', 'legal counsel', 'associate counsel', 'general counsel'],
  'finance_heavy': ['financial analyst', 'accountant', 'controller', 'cfo', 'actuary', 'bookkeeper'],
  'evergreen': ['future opportunities', 'talent pipeline', 'general application', 'join our talent network'],
}

export function cheapScore(title: string, description?: string): CheapScoreResult {
  const text = `${title} ${description ?? ''}`.toLowerCase()

  // Check penalty first — hard penalize obvious wrong-lane roles
  for (const [family, terms] of Object.entries(PENALIZED)) {
    for (const term of terms) {
      if (text.includes(term)) {
        return {
          score: -20,
          reason: `Penalized: matches ${family} family ("${term}")`,
          family,
          penalized: true,
        }
      }
    }
  }

  // Score positive fit
  let bestScore = 0
  let bestFamily = 'unknown'
  let bestReason = 'No strong family match'

  for (const [family, terms] of Object.entries(STRONG_FIT)) {
    for (const term of terms) {
      if (text.includes(term)) {
        // Primary title match scores higher than body match
        const inTitle = title.toLowerCase().includes(term)
        const score = inTitle ? 85 : 55
        if (score > bestScore) {
          bestScore = score
          bestFamily = family
          bestReason = `Matches ${family.replace(/_/g, ' ')} family ("${term}"${inTitle ? ', title match' : ''})`
        }
      }
    }
  }

  // Partial credit for adjacent terms
  const adjacentTerms = ['manager', 'coordinator', 'analyst', 'specialist', 'administrator', 'lead', 'director']
  if (bestScore === 0) {
    for (const term of adjacentTerms) {
      if (title.toLowerCase().includes(term)) {
        bestScore = 30
        bestFamily = 'adjacent'
        bestReason = `Adjacent role term ("${term}") — needs AI review`
        break
      }
    }
  }

  return {
    score: bestScore,
    reason: bestReason,
    family: bestFamily,
    penalized: false,
  }
}

// For automated roles: drop if cheap score is too low
// For manual roles: bypass this gate entirely
export function passesAutomatedGate(score: number, threshold = 30): boolean {
  return score >= threshold
}
