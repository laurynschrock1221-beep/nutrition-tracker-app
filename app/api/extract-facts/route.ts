import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const {
      old_resume,
      master_resume,
      fact_bank,
    }: {
      old_resume: string
      master_resume: string
      fact_bank?: string
    } = await req.json()

    if (!old_resume || !master_resume) {
      return NextResponse.json(
        { error: 'old_resume and master_resume are required' },
        { status: 400 }
      )
    }

    const prompt = `You are reviewing an older resume to extract any facts, achievements, skills, or experiences that are NOT already captured in the candidate's current master resume or fact bank.

CURRENT MASTER RESUME:
${master_resume}

${fact_bank?.trim() ? `CURRENT FACT BANK:\n${fact_bank}` : ''}

OLDER RESUME TO MINE:
${old_resume}

Your task: identify everything in the older resume that adds new information — roles, responsibilities, achievements, metrics, tools, skills, certifications, or context not present in the master resume or fact bank.

Rules:
- Only include genuinely NEW information not already covered
- Keep each fact as one concise sentence (max 20 words)
- Focus on specific, quantifiable achievements and unique skills
- Ignore duplicates, near-duplicates, and generic phrases already captured
- If nothing new is found, respond with exactly: "No new facts found."

Output format — a plain bulleted list, one fact per line:
• [fact]
• [fact]

Output ONLY the bullet list (or "No new facts found."). No preamble or explanation.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const extracted = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    return NextResponse.json({ extracted })
  } catch (err) {
    console.error('extract-facts error:', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
