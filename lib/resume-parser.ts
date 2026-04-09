export interface ResumeHeader {
  name: string
  credentials: string
  contact: string
}

export interface ExperienceEntry {
  company: string
  location: string
  title: string
  dateRange: string
  bullets: string[]
}

export interface ParsedResume {
  header: ResumeHeader
  summary: string
  competencies: string[]
  experience: ExperienceEntry[]
  education: string[]
  educationBlocks: string[][]
  tools: string[]
  raw: string
}

type SectionType = 'summary' | 'competencies' | 'experience' | 'education' | 'tools' | 'unknown'

function classifySection(header: string): SectionType {
  const h = header.toUpperCase()
  if (h.includes('SUMMARY') || h.includes('PROFILE') || h.includes('OBJECTIVE')) return 'summary'
  if (h.includes('COMPETENC') || h.includes('CAPABILIT') || h.includes('SKILLS') || h.includes('EXPERTISE') || h.includes('QUALIFICATIONS')) return 'competencies'
  if (h.includes('EXPERIENCE') || h.includes('EMPLOYMENT') || h.includes('WORK HISTORY')) return 'experience'
  if (h.includes('EDUCATION') || h.includes('ACADEMIC') || h.includes('DEGREE')) return 'education'
  if (h.includes('TOOL') || h.includes('TECHNOLOGY') || h.includes('TECHNICAL') || h.includes('SYSTEM') || h.includes('SOFTWARE') || h.includes('PLATFORM')) return 'tools'
  return 'unknown'
}

// Any all-caps line acts as a section boundary (prevents content bleeding between sections).
// Only lines that classify to a known type are kept as actual sections.
function isAnyCapsLine(l: string): boolean {
  const tr = l.trim()
  return tr.length >= 3 && /^[A-Z][A-Z\s&\/\-,.']+$/.test(tr)
}

export function parseResume(raw: string): ParsedResume {
  const lines = raw.split('\n')

  // Find first section-like header to delimit the name/contact block
  let firstHeaderIdx = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (isAnyCapsLine(lines[i]) && classifySection(lines[i].trim()) !== 'unknown') {
      firstHeaderIdx = i
      break
    }
  }

  const headerLines = lines.slice(0, firstHeaderIdx).map(l => l.trim()).filter(Boolean)
  const nameLine = headerLines[0] ?? ''
  const contactLine = headerLines[1] ?? ''

  const credMatch =
    nameLine.match(/^(.+?),\s*(M[A-Z].+)$/) ||
    nameLine.match(/^(.+?);\s*(.+)$/) ||
    nameLine.match(/^(.+?),\s*([A-Z]{2,}.*)$/)
  const name = credMatch ? credMatch[1].trim() : nameLine
  const credentials = credMatch ? credMatch[2].trim() : ''

  // Split into sections — use ANY all-caps line as boundary, only keep known types
  type Section = { type: SectionType; lines: string[] }
  const sections: Section[] = []
  let current: Section | null = null

  for (let i = firstHeaderIdx; i < lines.length; i++) {
    const line = lines[i]
    if (isAnyCapsLine(line)) {
      if (current && current.type !== 'unknown') sections.push(current)
      current = { type: classifySection(line.trim()), lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current && current.type !== 'unknown') sections.push(current)

  const get = (type: SectionType) => sections.find(s => s.type === type)

  const summarySection = get('summary')
  const summary = summarySection
    ? summarySection.lines.map(l => l.trim()).filter(Boolean).join(' ')
    : ''

  const compSection = get('competencies')
  const competencies = compSection
    ? compSection.lines.map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
    : []

  const expSection = get('experience')
  const experience = expSection ? parseExperienceLines(expSection.lines) : []

  const eduSection = get('education')
  const educationBlocks: string[][] = []
  if (eduSection) {
    let block: string[] = []
    for (const line of eduSection.lines) {
      const t = line.trim()
      if (!t) {
        if (block.length) { educationBlocks.push(block); block = [] }
      } else {
        block.push(t)
      }
    }
    if (block.length) educationBlocks.push(block)
  }
  const education = educationBlocks.flat()

  const toolsSection = get('tools')
  let tools: string[] = []
  if (toolsSection) {
    const allContent = toolsSection.lines.map(l => l.trim()).filter(Boolean)
    const hasInline = allContent.some(l => l.includes('|'))
    if (hasInline) {
      tools = allContent.join(' | ').split('|').map(t => t.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
    } else {
      tools = allContent.map(t => t.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
    }
  }

  return { header: { name, credentials, contact: contactLine }, summary, competencies, experience, education, educationBlocks, tools, raw }
}

/* ── Experience parsing ──────────────────────────────────────────────── */

const MONTH_RE = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Present)\b/i

// "Title | Jan 2022 – Present" or "Title | February 2020 – November 2024"
function isTitleDateLine(l: string): boolean {
  if (!l.includes(' | ')) return false
  const right = l.slice(l.lastIndexOf(' | ') + 3)
  return /\d{4}/.test(right) && MONTH_RE.test(right)
}

// Purely a date line on its own, e.g. "Feb 2020 – Nov 2024; Aug 2025 – Present"
function isStandaloneDateLine(l: string): boolean {
  if (!l || l.length > 70) return false
  return MONTH_RE.test(l.slice(0, 15)) || /^\d{4}\s*[–\-—]/.test(l)
}

function parseCompanyLine(l: string): { company: string; location: string } {
  const sep = l.includes(' – ') ? ' – ' : l.includes(' — ') ? ' — ' : l.includes(' - ') ? ' - ' : ''
  if (sep) {
    const idx = l.indexOf(sep)
    return { company: l.slice(0, idx).trim(), location: l.slice(idx + sep.length).trim() }
  }
  return { company: l, location: '' }
}

function parseExperienceLines(lines: string[]): ExperienceEntry[] {
  const t = lines.map(l => l.trim())

  // Detect which format the AI used
  const titleDateCount = t.filter(l => isTitleDateLine(l)).length
  const standaloneDateCount = t.filter(l => isStandaloneDateLine(l)).length

  if (titleDateCount >= standaloneDateCount && titleDateCount > 0) {
    return parseTitleDateFormat(t)
  } else if (standaloneDateCount > 0) {
    return parseDateOnlyFormat(t)
  }
  return []
}

// Format: Company – Location\nTitle | Date\n• bullet
function parseTitleDateFormat(t: string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = []
  const anchors = t.reduce<number[]>((acc, l, i) => isTitleDateLine(l) ? [...acc, i] : acc, [])

  for (let ei = 0; ei < anchors.length; ei++) {
    const ai = anchors[ei]
    const titleFull = t[ai]
    const pipeIdx = titleFull.lastIndexOf(' | ')
    const title = titleFull.slice(0, pipeIdx).trim()
    const dateRange = titleFull.slice(pipeIdx + 3).trim()

    // Company: closest non-blank line above the title|date line
    let ci = ai - 1
    while (ci >= 0 && !t[ci]) ci--
    const { company, location } = ci >= 0 ? parseCompanyLine(t[ci]) : { company: '', location: '' }

    // Bullets: lines after anchor, stop before next entry's company line
    let bulletEnd = t.length
    if (ei + 1 < anchors.length) {
      let nextCi = anchors[ei + 1] - 1
      while (nextCi >= 0 && !t[nextCi]) nextCi--
      bulletEnd = nextCi // stop before next entry's company line
    }

    const bullets: string[] = []
    for (let b = ai + 1; b < bulletEnd; b++) {
      const bl = t[b]
      if (!bl) continue
      bullets.push(bl.replace(/^[•\-\*]\s*/, '').trim())
    }

    if (company || title) entries.push({ company, location, title, dateRange, bullets })
  }

  return entries
}

// Format: Company\nTitle\nDate Range\ncontent lines (no bullet chars)
function parseDateOnlyFormat(t: string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = []
  const anchors = t.reduce<number[]>((acc, l, i) => (l && isStandaloneDateLine(l)) ? [...acc, i] : acc, [])

  for (let ei = 0; ei < anchors.length; ei++) {
    const di = anchors[ei]
    const dateRange = t[di]

    let titleIdx = di - 1
    while (titleIdx >= 0 && !t[titleIdx]) titleIdx--
    const title = titleIdx >= 0 ? t[titleIdx] : ''

    let compIdx = titleIdx - 1
    while (compIdx >= 0 && !t[compIdx]) compIdx--
    const { company, location } = compIdx >= 0 ? parseCompanyLine(t[compIdx]) : { company: '', location: '' }

    // Stop before the company line of the next entry
    let bulletEnd = t.length
    if (ei + 1 < anchors.length) {
      const nextDi = anchors[ei + 1]
      let nextTitleIdx = nextDi - 1
      while (nextTitleIdx > di && !t[nextTitleIdx]) nextTitleIdx--
      let nextCompIdx = nextTitleIdx - 1
      while (nextCompIdx > di && !t[nextCompIdx]) nextCompIdx--
      bulletEnd = nextCompIdx
    }

    const bullets: string[] = []
    for (let b = di + 1; b < bulletEnd; b++) {
      const bl = t[b]
      if (!bl) continue
      bullets.push(bl.replace(/^[•\-\*]\s*/, '').trim())
    }

    if (company || title) entries.push({ company, location, title, dateRange, bullets })
  }

  return entries
}
