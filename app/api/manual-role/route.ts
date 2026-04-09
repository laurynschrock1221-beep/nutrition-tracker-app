import { NextRequest, NextResponse } from 'next/server'
import type { ScoreResult, GenerateResult } from '@/lib/types'

// Full pipeline: score + generate for a manual role submission
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

    const base = req.nextUrl.origin

    // Step 1: Score the role
    const scoreRes = await fetch(`${base}/api/score-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd_text, master_resume, is_manual: true }),
    })

    if (!scoreRes.ok) {
      const err = await scoreRes.json()
      return NextResponse.json({ error: err.error ?? 'Scoring failed' }, { status: 500 })
    }

    const score_result = (await scoreRes.json()) as ScoreResult

    // Step 2: Generate resume (manual roles always generate)
    const genRes = await fetch(`${base}/api/generate-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jd_text,
        master_resume,
        fact_bank,
        score_result,
        company: company ?? 'Unknown Company',
        title: title ?? 'Unknown Title',
        location,
      }),
    })

    if (!genRes.ok) {
      const err = await genRes.json()
      return NextResponse.json({ error: err.error ?? 'Generation failed' }, { status: 500 })
    }

    const generate_result = (await genRes.json()) as GenerateResult

    return NextResponse.json({
      score_result,
      generate_result,
      role_key,
    })
  } catch (err) {
    console.error('manual-role error:', err)
    return NextResponse.json({ error: 'Pipeline failed' }, { status: 500 })
  }
}
