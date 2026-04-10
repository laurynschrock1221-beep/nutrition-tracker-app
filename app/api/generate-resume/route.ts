import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { GenerateResult, ScoreResult } from '@/lib/types'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const {
      jd_text,
      master_resume,
      fact_bank,
      score_result,
      company,
      title,
      location,
    }: {
      jd_text: string
      master_resume: string
      fact_bank?: string
      score_result: ScoreResult
      company: string
      title: string
      location?: string
    } = await req.json()

    if (!jd_text || !master_resume || !company || !title) {
      return NextResponse.json(
        { error: 'jd_text, master_resume, company, and title are required' },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().split('T')[0]
    const outputFile = `${company} — ${title} — ${today} — match ${score_result.match_pct}%`

    // Extract name and all header lines directly from the master resume
    // so the AI cannot substitute or redact them
    const masterLines = master_resume.split('\n').map(l => l.trim()).filter(Boolean)
    // Find where first ALL-CAPS section header begins to delimit the header block
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

RULES — violating any rule makes the output unusable:
1. The five section headers must appear EXACTLY as shown: PROFESSIONAL SUMMARY, CORE COMPETENCIES, PROFESSIONAL EXPERIENCE, EDUCATION, TECHNICAL TOOLS — no substitutions, no additions, no extra sections
2. CORE COMPETENCIES: exactly 7-8 bullet points, each 1-4 words, chosen to match the target role
3. PROFESSIONAL EXPERIENCE: 5-7 bullets for the most recent role, 3-4 for older roles
4. Each bullet is one sentence, maximum 20 words, starts with a strong past-tense action verb
5. Do NOT invent, fabricate, or embellish any experience, dates, titles, companies, or credentials
6. TECHNICAL TOOLS: pipe-separated on a single line, no bullets
7. No markdown, no asterisks, no bold/italic markers — plain text only
8. Output ONLY the resume. No preamble, explanation, or commentary.`

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

    const result: GenerateResult = {
      resume_text,
      output_file: outputFile,
      integrity_notes,
      match_pct: score_result.match_pct,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('generate-resume error:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
