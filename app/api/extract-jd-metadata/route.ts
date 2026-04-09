import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { jd_text } = await req.json()
    if (!jd_text?.trim()) {
      return NextResponse.json({ company: '', title: '', location: '' })
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      messages: [
        {
          role: 'user',
          content: `Extract the company name, job title, and location from this job description. Respond with JSON only — no markdown, no explanation.

{"company": "<company name or empty string>", "title": "<job title or empty string>", "location": "<location or empty string>"}

If you cannot confidently determine a value, use an empty string.

JOB DESCRIPTION:
${jd_text.slice(0, 3000)}`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const result = JSON.parse(cleaned)

    return NextResponse.json({
      company: result.company ?? '',
      title: result.title ?? '',
      location: result.location ?? '',
    })
  } catch (err) {
    console.error('extract-jd-metadata error:', err)
    return NextResponse.json({ company: '', title: '', location: '' })
  }
}
