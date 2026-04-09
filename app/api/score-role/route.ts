import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ScoreResult } from '@/lib/types'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { jd_text, master_resume, is_manual = false } = await req.json()

    if (!jd_text || !master_resume) {
      return NextResponse.json(
        { error: 'jd_text and master_resume are required' },
        { status: 400 }
      )
    }

    const prompt = `You are a resume matching expert. Assess how well this candidate fits the job description.

${is_manual ? 'NOTE: This role was submitted manually by the user — they have expressed intent to apply, so be willing to generate a draft even at modest fit.' : ''}

JOB DESCRIPTION:
${jd_text}

CANDIDATE RESUME:
${master_resume}

Analyze the fit and respond with a JSON object only (no markdown, no explanation, just valid JSON):
{
  "should_generate": <boolean>,
  "match_score": <integer 0-100>,
  "match_pct": <integer, rounded to nearest 5>,
  "drop_reason": <string or null — only if should_generate is false>,
  "strengths": <array of 2-4 strings describing key alignment points>,
  "gaps": <array of 0-3 strings describing key gaps>
}

Scoring guidelines:
- 80+: Strong fit, definitely generate
- 65-79: Good fit, generate
- 50-64: Marginal fit, generate (especially if manual)
- 35-49: Weak fit — generate only if manual and user intent is clear
- Below 35: Drop (even if manual, flag as low confidence but still generate for manual)
${is_manual ? '- For this manual role: generate if match_score >= 35, note low confidence in drop_reason if below 50' : '- For automated roles: only generate if match_score >= 50'}

Domain alignment notes (use these to calibrate your score):
- Compliance/regulatory operations roles are a STRONG match for this candidate: she has direct experience managing 700+ IRS filings annually with 100% accuracy, nonprofit regulatory compliance, and audit-ready documentation practices. Compliance work is operationally transferable — deadline tracking, documentation systems, audit readiness, and cross-functional coordination are the core skills regardless of the specific regulatory domain (IRS, state tax, gaming licenses, etc.).
- When a role requires specific regulatory domains the candidate hasn't listed explicitly (e.g. sales tax, charitable gaming), treat this as a minor gap — not a disqualifier. Operational compliance skills transfer directly.
- CRM governance and data integrity roles are a STRONG match: she has hands-on Salesforce administration, governance, and data quality work.
- Nonprofit and association management contexts are a STRONG match: she has worked at nonprofit/association organizations and understands the regulatory environment including IRS compliance, exemption status, and audit documentation.
- Roles that are primarily accounting, bookkeeping, or financial analysis (not compliance/operations) are a WEAK match.

Keep strengths and gaps concise (one sentence each).`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // Strip potential markdown fences
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const result = JSON.parse(cleaned) as ScoreResult

    // For manual roles: force generate even at low confidence
    if (is_manual && !result.should_generate && result.match_score >= 35) {
      result.should_generate = true
      result.drop_reason = undefined
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('score-role error:', err)
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 })
  }
}
