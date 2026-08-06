import { createClient } from '@supabase/supabase-js';

const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn("Missing public Supabase credentials. File uploads will fail.");
}

// Client strictly restricted to public anon operations
export const supabasePublic = createClient(
  NEXT_PUBLIC_SUPABASE_URL || '', 
  NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);
