import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { jd_text, master_resume, fact_bank, resume_text, company, title, location } =
      await req.json()

    if (!jd_text || !master_resume || !company || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Extract name and contact from master resume header
    const masterLines = master_resume.split('\n').map((l: string) => l.trim()).filter(Boolean)
    const headerName = masterLines[0] ?? ''
    const headerContact = masterLines[1] ?? ''

    const prompt = `You are a professional cover letter writer. Write a compelling, human cover letter for this role.

TARGET ROLE:
Company: ${company}
Title: ${title}
${location ? `Location: ${location}` : ''}

JOB DESCRIPTION:
${jd_text}

CANDIDATE'S MASTER RESUME:
${master_resume}

${fact_bank ? `ADDITIONAL FACTS:\n${fact_bank}` : ''}

${resume_text ? `TAILORED RESUME FOR THIS ROLE:\n${resume_text.slice(0, 1500)}` : ''}

OUTPUT FORMAT — output the letter exactly as shown below, filling in the bracketed sections:

${headerName}

${headerContact}

Dear Hiring Manager,

[Opening paragraph: What drew you to this specific role and company. Reference something concrete from the JD. Explain why this work matters to you. 3-5 sentences.]

[Second paragraph: A specific story or achievement from your most recent or most relevant role that directly maps to a core need in this JD. Be concrete — name the company, describe the work, include a metric if available. 4-6 sentences.]

[Third paragraph: A second specific story or achievement from another role that shows a different relevant skill or context. Again concrete and specific. 4-6 sentences.]

[Fourth paragraph: A brief closing that ties your overall approach or values to what this role requires. Express genuine enthusiasm. 3-4 sentences.]

Thank you for your time and consideration.

Sincerely,

${headerName.split(',')[0]}

RULES:
1. Output the full letter including the header lines, salutation, all paragraphs, closing, and signature exactly as formatted above
2. Do NOT fabricate experience, companies, dates, or metrics not in the resume or fact bank
3. Do NOT use clichés: "I am writing to", "I am a perfect fit", "passion", "leverage", "dynamic"
4. Tone: professional, warm, and direct — written like a real person, not a template
5. Each body paragraph must be specific and grounded in actual experience
6. 400–500 words for the body paragraphs combined`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const cover_letter_text =
      message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    return NextResponse.json({ cover_letter_text })
  } catch (err) {
    console.error('generate-cover-letter error:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
