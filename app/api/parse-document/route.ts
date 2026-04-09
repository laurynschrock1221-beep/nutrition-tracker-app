import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const name = file.name.toLowerCase()
    let text = ''

    if (name.endsWith('.pdf')) {
      // Use Claude to extract text from PDF — handles both digital and scanned PDFs
      const base64 = buffer.toString('base64')
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: 'Extract all text from this resume document. Output the raw text only, preserving the structure and line breaks as closely as possible. No commentary.',
              },
            ],
          },
        ],
      })
      text = message.content[0].type === 'text' ? message.content[0].text : ''
    } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a PDF or Word document.' },
        { status: 400 }
      )
    }

    // Clean up excessive whitespace
    text = text
      .split('\n')
      .map((l: string) => l.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    return NextResponse.json({ text })
  } catch (err) {
    console.error('parse-document error:', err)
    const message = err instanceof Error ? err.message : 'Failed to parse document'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
