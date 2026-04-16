import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const {
      master_resume,
      fact_bank,
    }: {
      master_resume: string
      fact_bank?: string
    } = await req.json()

    if (!master_resume) {
      return NextResponse.json(
        { error: 'master_resume is required' },
        { status: 400 }
      )
    }

    const prompt = `You are a LinkedIn profile copywriter. Generate polished, keyword-rich LinkedIn profile content based on this candidate's resume.

MASTER RESUME:
${master_resume}

${fact_bank ? `ADDITIONAL FACTS / FACT BANK:\n${fact_bank}` : ''}

Generate the following sections and return ONLY valid JSON — no markdown, no code fences, no commentary. The JSON must match this exact structure:

{
  "headlines": [
    { "focus": "Operations & Program Management", "text": "..." },
    { "focus": "Compliance & Regulatory Operations", "text": "..." },
    { "focus": "CRM & Business Systems", "text": "..." }
  ],
  "about": "...",
  "experience": [
    { "company": "...", "title": "...", "bullets": ["...", "..."] }
  ]
}

HEADLINE RULES (apply to all 3 variants):
- Maximum 220 characters each
- Punchy, keyword-rich, no fluff
- Each targets a different role family as indicated by the focus label
- Use pipes or em-dashes to separate clauses
- Lead with the strongest identifier for that focus area

ABOUT SECTION RULES:
- 3-4 paragraphs, first-person voice, approximately 300 words total
- Paragraph 1: professional identity and mission
- Paragraph 2: key strengths and differentiators
- Paragraph 3: what she brings to organizations / notable accomplishments
- Paragraph 4 (closing): end with a soft call to action starting with "Open to opportunities in..."
- Should work across all three role families
- No bullet points — flowing prose only

EXPERIENCE SECTION RULES:
- Include every job from the master resume
- For each job: 3-4 bullets optimized for LinkedIn (shorter than resume bullets, punchier, keyword-dense, quantified where possible)
- Each bullet starts with a strong past-tense action verb (present tense for current role)
- Each bullet is one sentence, maximum 20 words
- Do NOT invent or fabricate any details
- Order jobs most-recent first

Output ONLY the JSON object. Nothing else.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Try to extract JSON if there's surrounding text
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) {
        return NextResponse.json({ error: 'Failed to parse LinkedIn content from model response' }, { status: 500 })
      }
      parsed = JSON.parse(match[0])
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('generate-linkedin error:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
