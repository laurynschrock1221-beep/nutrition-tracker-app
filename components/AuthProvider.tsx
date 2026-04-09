'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import Nav from './Nav'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session && pathname !== '/auth') {
        router.replace('/auth')
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) router.replace('/auth')
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  // Still checking auth — show nothing to avoid flash
  if (session === undefined) {
    return <div className="min-h-screen bg-slate-950" />
  }

  // Not logged in — render auth page without Nav
  if (!session) {
    return <>{children}</>
  }

  // Resume preview pages need full-width, no nav chrome
  if (pathname.startsWith('/resume-preview') || pathname.startsWith('/cover-letter-preview')) {
    return <>{children}</>
  }

  // Logged in — render app with Nav
  return (
    <>
      <main className="max-w-lg mx-auto pb-20 min-h-screen">
        {children}
        <div className="flex justify-center pb-2 pt-4">
          <a
            href="/settings"
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            Settings
          </a>
        </div>
      </main>
      <Nav />
    </>
  )
}
