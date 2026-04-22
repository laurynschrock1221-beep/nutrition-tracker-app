import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ScoreResult, GenerateResult } from '@/lib/types'

const client = new Anthropic()

// ── Inline scoring logic (avoids internal HTTP 401 on Vercel) ────────────────

async function runScore(jd_text: string, master_resume: string): Promise<ScoreResult> {
  const prompt = `You are a resume matching expert. Before scoring, read all instructions below carefully — they define how to interpret this candidate's experience.

── SCORING PHILOSOPHY ───────────────────────────────────────────────────────
Score based on tailored potential, not literal resume keywords. This candidate's experience
can be reframed to match many JD requirements — your score should reflect what a tailored
resume could honestly claim, not just what the master resume literally says.

Hard vs soft gaps — this distinction drives the score:
- HARD gap: specific required LICENSE or CREDENTIAL the candidate does not hold (CPA, JD, bar
  license, Series 7, NMLS, PE, notary commission, security clearance). These are hard gates.
- HARD gap: years of experience the candidate clearly does not meet (e.g. "10+ years required").
- SOFT gap: industry sector or vocabulary (mortgage, fintech, healthcare, gaming, real estate).
  Industry sector alone is NEVER a hard gap. Operations, coordination, compliance, documentation,
  and cross-functional skills transfer across industries. Score the capability, not the sector.
- SOFT gap: preferred or nice-to-have certifications, domain exposure, specific software listed
  as preferred rather than required.
- Soft gaps do NOT meaningfully reduce the score — they are bridgeable through reframing.

IMPORTANT: When a JD says "X years of mortgage/lending/real estate experience required",
ask whether the UNDERLYING SKILLS (document coordination, compliance monitoring, cross-functional
communication, deadline management, audit readiness) are present — if yes, treat the industry
requirement as a soft gap, not a hard one. Only treat it as hard if the JD requires a specific
license or certification that the candidate does not hold.

"OR" clauses: If a JD says "fintech OR regulatory-heavy environment", treat that as MET.
The candidate has two legitimate regulatory-heavy environments — score as if the requirement
is fully satisfied, not partially.

── CANDIDATE EXPERIENCE REFRAMINGS ──────────────────────────────────────────
Apply these when evaluating whether the candidate meets JD requirements:

COMPLIANCE & REGULATORY OPERATIONS — treat as STRONG match for any compliance role:
- Her AAUW work is compliance framework governance at national scale: building enforcement
  frameworks, developing escalation paths, conducting noncompliance investigations, maintaining
  ongoing risk assessment across 883 external entities across all 50 states.
- The 883 AAUW affiliates ARE third parties. Her work reviewing/validating their financial
  submissions, assessing compliance status, and remediating noncompliance (including revoking
  tax-exempt status) IS third-party due diligence. Credit it as such.
- Managing IRS compliance for 883 affiliates across all 50 states IS multi-jurisdictional
  compliance at national scale. Credit it when JDs ask for multi-state or multi-jurisdiction experience.
- International export compliance under USDA and WTC regulations (Leprino Foods) is a second
  regulatory-heavy environment. When a JD says "fintech OR regulatory-heavy", both environments
  together mean this requirement is fully met.
- Specific regulatory domains not listed (sales tax, gaming, healthcare) = SOFT gap only.
  Operational compliance skills transfer directly.

CRM & DATA INTEGRITY — STRONG match:
- Hands-on Salesforce administration, governance, and data quality. 8,000+ records managed.
- Credit for any CRM platform, data governance, or data integrity requirement.

NONPROFIT / ASSOCIATION MANAGEMENT — STRONG match:
- Direct nonprofit/association experience including IRS compliance, exemption status
  governance, and audit documentation.

AI TOOLS — strength when JD mentions AI:
- Active daily user of Claude, ChatGPT, and Gemini for compliance workflow optimization.

PROJECT MANAGEMENT — credit as initiative leadership:
- Led two org-wide compliance initiatives end-to-end. Not coordination — initiative ownership.

WEAK match: roles that are primarily accounting, bookkeeping, or financial analysis.

── SALARY & LOCATION FILTERS ────────────────────────────────────────────────
SALARY: Only flag if a specific salary or salary range is EXPLICITLY stated in the JD text above.
If the stated maximum is below $85,000 → add "Salary below $85k minimum" to hard_filter_reasons.
If the range overlaps $85k (e.g. $75k-$95k) → do NOT flag, the role can meet the minimum.
NEVER infer, estimate, or use external knowledge about typical pay for a role type. If no salary
is stated in the JD, do not mention salary at all.

LOCATION: If the role explicitly requires relocation or is fully on-site outside Denver metro →
add "Location outside Denver metro / relocation required" to hard_filter_reasons.
Set hard_filter_risk: true if either filter triggers.

── HARD FILTER RISK ─────────────────────────────────────────────────────────
Set hard_filter_risk: true ONLY for explicit, unambiguous blockers:
- Required LICENSE or CREDENTIAL not held (CPA, JD, bar license, Series 7, NMLS, PE,
  notary commission, security clearance)
- Years of experience clearly not met
- Salary or location filters above
Do NOT flag: industry sector gaps, preferred credentials, transferable domains, vocabulary gaps.
Industry experience requirements (mortgage, fintech, healthcare, etc.) are NEVER hard filter
risks unless they come with a specific required license.

── JOB DESCRIPTION ──────────────────────────────────────────────────────────
${jd_text}

── CANDIDATE RESUME ─────────────────────────────────────────────────────────
${master_resume}

── OUTPUT ───────────────────────────────────────────────────────────────────
NOTE: This role was manually submitted — generate a draft if match_score >= 35.

Respond with a JSON object only (no markdown, no explanation, just valid JSON):
{
  "should_generate": <boolean>,
  "match_score": <integer 0-100>,
  "match_pct": <integer, rounded to nearest 5>,
  "drop_reason": <string or null — only if should_generate is false>,
  "strengths": <array of 2-4 strings describing key alignment points>,
  "gaps": <array of 0-3 strings — only genuine hard gaps or significant soft gaps>,
  "hard_filter_risk": <boolean>,
  "hard_filter_reasons": <array of 0-3 short strings — empty array if none>
}

Scoring thresholds:
- 80+: Strong fit  |  65-79: Good fit  |  50-64: Marginal  |  35-49: Weak (generate if manual)
Keep strengths, gaps, and hard_filter_reasons concise (one phrase or sentence each).`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const result = JSON.parse(cleaned) as ScoreResult

  if (!result.should_generate && result.match_score >= 35) {
    result.should_generate = true
    result.drop_reason = undefined
  }

  return result
}

// ── Inline generation logic ──────────────────────────────────────────────────

async function runGenerate(
  jd_text: string,
  master_resume: string,
  fact_bank: string | undefined,
  score_result: ScoreResult,
  company: string,
  title: string,
  location: string | undefined
): Promise<GenerateResult> {
  const today = new Date().toISOString().split('T')[0]
  const outputFile = `${company} — ${title} — ${today} — match ${score_result.match_pct}%`

  const masterLines = master_resume.split('\n').map(l => l.trim()).filter(Boolean)
  const firstSectionIdx = masterLines.findIndex((l, i) => i > 0 && /^[A-Z][A-Z\s]{3,}$/.test(l))
  const headerBlock = masterLines.slice(0, firstSectionIdx > 0 ? firstSectionIdx : 3)
  const headerName = headerBlock[0] ?? ''
  const headerContact = headerBlock.slice(1).join('\n')

  const prompt = `You are a professional resume writer. Create a tailored resume for this specific role.

TARGET ROLE:
Company: ${company}
Title: ${title}
${location ? `Location: ${location}` : ''}

JOB DESCRIPTION:
${jd_text}

CANDIDATE'S MASTER RESUME:
${master_resume}

${fact_bank ? `ADDITIONAL FACTS / FACT BANK:\n${fact_bank}` : ''}

MATCH ASSESSMENT:
Score: ${score_result.match_score}/100
Strengths: ${score_result.strengths.join('; ')}
${score_result.gaps.length > 0 ? `Gaps: ${score_result.gaps.join('; ')}` : ''}

OUTPUT FORMAT — copy this structure exactly, including exact section header text.
The header lines below are hardcoded — output them exactly as shown, do not alter or omit any of them:

${headerName}
${headerContact}

PROFESSIONAL SUMMARY

[2-3 sentence tailored paragraph]

CORE COMPETENCIES

• [competency 1]
• [competency 2]
• [competency 3]
• [competency 4]
• [competency 5]
• [competency 6]
• [competency 7]
• [competency 8]

PROFESSIONAL EXPERIENCE

[Company Name – City, State]
[Job Title | Start Month Year – End Month Year]
• [bullet]
• [bullet]
• [bullet]
• [bullet]
• [bullet]

[Company Name – City, State]
[Job Title | Start Month Year – End Month Year]
• [bullet]
• [bullet]
• [bullet]

EDUCATION

[Degree]
[Institution], [Year]

[Additional degree or certificate group]
[Institution], [Year]

TECHNICAL TOOLS

[Tool1] | [Tool2] | [Tool3] | [Tool4]

REFRAMING PRINCIPLES — apply these when writing bullets and the summary:

1. COMPLIANCE FRAMEWORK LANGUAGE
   The candidate's AAUW work is not just "filing IRS forms." Frame it as:
   - Building and enforcing compliance frameworks at national scale
   - Developing governance frameworks and escalation paths
   - Conducting noncompliance investigations and implementing remediation
   - Monitoring compliance across 883 external entities (third parties)
   - Maintaining ongoing risk assessment and gap identification
   Use whichever framing is most relevant to the target JD.

2. THIRD-PARTY DUE DILIGENCE
   AAUW's 883 affiliates ARE third parties. Frame affiliate compliance work as:
   - Reviewing and validating external entity financial submissions
   - Assessing compliance status and identifying noncompliant entities
   - Remediating noncompliance including revoked tax-exempt status
   - Maintaining ongoing monitoring across a national network
   Use this framing whenever the JD asks for third-party due diligence experience.

3. REGULATORY-HEAVY ENVIRONMENT
   The candidate has TWO regulatory-heavy environments:
   - IRS federal compliance governance across 50 states (AAUW)
   - International export compliance under USDA and WTC regulations (Leprino)
   Surface whichever is more relevant to the JD. Both are legitimate.

4. MULTI-JURISDICTIONAL COMPLIANCE
   Managing IRS compliance for 883 affiliates across all 50 states IS multi-jurisdictional
   compliance at national scale. Use this exact framing when JDs ask for multi-state or
   multi-jurisdiction experience.

5. AI TOOLS
   The candidate is an active daily user of Claude, ChatGPT, and Gemini for compliance
   workflow optimization. Surface this prominently when the JD mentions AI tools or
   AI-assisted workflows.

6. PROJECT MANAGEMENT
   The candidate led two org-wide compliance initiatives end-to-end. Frame this as
   initiative leadership, not just coordination.

RULES — violating any rule makes the output unusable:
1. The five section headers must appear EXACTLY as shown: PROFESSIONAL SUMMARY, CORE COMPETENCIES, PROFESSIONAL EXPERIENCE, EDUCATION, TECHNICAL TOOLS — no substitutions, no additions, no extra sections
2. CORE COMPETENCIES: exactly 7-8 bullet points, each 1-4 words, chosen to match the target role
3. PROFESSIONAL EXPERIENCE: 5-7 bullets for the most recent role, 3-4 for older roles
4. PROFESSIONAL EXPERIENCE must be ordered by most recent end date — roles with "Present" always appear first, regardless of start date. A role active "Present" outranks any ended role even if the ended role started more recently.
5. Each bullet is one sentence, maximum 20 words, starts with a strong past-tense action verb (use present tense for current "Present" roles)
6. Do NOT invent, fabricate, or embellish any experience, dates, titles, companies, or credentials
7. TECHNICAL TOOLS: pipe-separated on a single line, no bullets
8. No markdown, no asterisks, no bold/italic markers — plain text only
9. Output ONLY the resume. No preamble, explanation, or commentary.
10. CONTEXT FRAMING — when the JD uses a category term (e.g. "donor management software", "grant management system", "CRM platform") and the candidate has a specific tool that belongs to that category, use the JD's category language in the bullet to make the match explicit to both ATS and human readers. Example: if JD says "donor management software" and candidate has Salesforce, write "Administered donor management database in Salesforce" rather than just mentioning Salesforce as a standalone tool. This bridges the gap between the candidate's specific experience and the employer's language.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const resume_text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  const integrityPrompt = `Review this tailored resume against the original master resume and note any factual discrepancies, embellishments, or fabricated details. Be brief.

MASTER RESUME:
${master_resume}

TAILORED RESUME:
${resume_text}

Respond with one of:
- "Clean: No integrity issues found."
- "Note: [brief description of any concerns]"

Keep it to one line.`

  const integrityMsg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [{ role: 'user', content: integrityPrompt }],
  })

  const integrity_notes =
    integrityMsg.content[0].type === 'text'
      ? integrityMsg.content[0].text.trim()
      : 'Integrity check skipped.'

  return {
    resume_text,
    output_file: outputFile,
    integrity_notes,
    match_pct: score_result.match_pct,
  }
}

// ── ATS compatibility check ──────────────────────────────────────────────────

async function runAtsCheck(
  jd_text: string,
  resume_text: string
): Promise<{ keywords_present: string[]; keywords_missing: string[] }> {
  const prompt = `You are an ATS (Applicant Tracking System) expert. Analyze whether this resume will pass ATS filtering for the job description.

JOB DESCRIPTION:
${jd_text}

RESUME:
${resume_text}

Extract the 10-15 most important ATS keywords from the job description. For each keyword, classify it:

REQUIRED: explicitly marked as required, must-have, or minimum qualification — ATS will hard-filter on these
PREFERRED: marked as preferred, desired, a plus, or nice-to-have — ATS may use these for ranking but not hard filtering

CRITICAL RULE — Category vs. Specific Tool:
If the JD mentions a SOFTWARE CATEGORY and the resume contains a specific named tool that belongs to that category, the category requirement is SATISFIED. Do not flag it as missing. Examples:
- "donor management software" is satisfied by Salesforce, Raiser's Edge, Bloomerang, DonorPerfect, etc.
- "CRM" or "CRM platform" is satisfied by Salesforce, HubSpot, Microsoft Dynamics, etc.
- "project management tool" is satisfied by Asana, Monday.com, Jira, Trello, etc.
- "data visualization software" is satisfied by Tableau, Power BI, DOMO, Looker, etc.
- "HRIS" is satisfied by Workday, ADP, BambooHR, etc.
- "accounting software" is satisfied by QuickBooks, NetSuite, Sage, etc.
Apply this logic broadly — if a specific tool the candidate has is a well-known example of a category the JD requires, mark the category as present.

Only put a keyword in "keywords_missing" if it is REQUIRED and genuinely absent (no equivalent tool or experience satisfies it).
Put preferred/nice-to-have keywords that are missing in "keywords_present" with a "~" prefix (e.g. "~ DOMO").
Put clearly present keywords (required or preferred, including satisfied categories) in "keywords_present" without any prefix.

Respond with ONLY valid JSON — no markdown, no explanation:
{
  "keywords_present": ["keyword1", "~ preferred_keyword"],
  "keywords_missing": ["required_keyword_not_in_resume"]
}

Keep each keyword short (1-4 words). Only flag as missing if it is truly required and has no equivalent in the resume.`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const result = JSON.parse(cleaned)
  return {
    keywords_present: result.keywords_present ?? [],
    keywords_missing: result.keywords_missing ?? [],
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { jd_text, company, title, location, master_resume, fact_bank, role_key } =
      await req.json()

    if (!jd_text || !master_resume) {
      return NextResponse.json(
        { error: 'jd_text and master_resume are required' },
        { status: 400 }
      )
    }

    const score_result = await runScore(jd_text, master_resume)

    // Ensure hard filter fields are always present
    if (score_result.hard_filter_risk === undefined) score_result.hard_filter_risk = false
    if (!score_result.hard_filter_reasons) score_result.hard_filter_reasons = []

    const generate_result = await runGenerate(
      jd_text,
      master_resume,
      fact_bank,
      score_result,
      company ?? 'Unknown Company',
      title ?? 'Unknown Title',
      location
    )

    // ATS check — non-fatal: if it fails, pipeline still succeeds
    let ats_result = { keywords_present: [] as string[], keywords_missing: [] as string[] }
    try {
      ats_result = await runAtsCheck(jd_text, generate_result.resume_text)
    } catch (err) {
      console.error('manual-role: ATS check failed (non-fatal):', err)
    }

    return NextResponse.json({ score_result, generate_result, ats_result, role_key })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('manual-role error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
