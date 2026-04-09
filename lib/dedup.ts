// Stable role key generation for deduplication

function normalizeCompany(company: string): string {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(i|ii|iii|iv|sr|jr|senior|junior|associate|staff|principal|lead)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

// Generates a stable key for deduplication across runs
// Two roles are considered duplicates if company + normalized title match
export function makeRoleKey(company: string, title: string, url?: string): string {
  if (url) {
    // URL is most stable identifier
    const cleanUrl = url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()
    return `url:${cleanUrl}`
  }
  const co = normalizeCompany(company)
  const ti = normalizeTitle(title)
  return `role:${co}:${ti}`
}

// Checks if a key from a new candidate matches an existing key
export function isDuplicate(
  candidateKey: string,
  existingKeys: Set<string>
): boolean {
  return existingKeys.has(candidateKey)
}

// Given a list of processed state role keys, builds a fast lookup set
export function buildKeySet(keys: string[]): Set<string> {
  return new Set(keys)
}

// Generates a synthetic URL for manual roles that have no real URL
export function syntheticManualUrl(company: string, title: string, createdAt: string): string {
  const co = normalizeCompany(company)
  const ti = normalizeTitle(title)
  const ts = createdAt.replace(/[^0-9]/g, '').slice(0, 12)
  return `manual://${co}/${ti}/${ts}`
}
