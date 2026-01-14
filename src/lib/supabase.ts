// lib/supabaseClient.ts  (or wherever you keep it)
import { createClient } from '@supabase/supabase-js'

// Option 1: Most recommended - runtime check + early error
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables!\n' +
    'Please define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY in .env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)