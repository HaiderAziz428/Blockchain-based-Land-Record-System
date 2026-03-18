// lib/supabaseClient.ts  (or wherever you keep it)
import { createClient } from '@supabase/supabase-js'

// Option 1: Most recommended - runtime check + early error
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ''

// We only want to throw the error if we are on the client-side/runtime, 
// not during the Vercel build/static-export step.
if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn('Supabase credentials missing!');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)