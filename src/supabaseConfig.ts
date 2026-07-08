// ---------------------------------------------------------------------------
// Supabase keys come from environment variables, never hardcoded.
//
// Put them in a ".env" file at the project root (see .env.example):
//   EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
//
// Expo inlines EXPO_PUBLIC_* vars into the bundle at build time. They MUST be
// read with literal `process.env.EXPO_PUBLIC_...` dot access for that to work.
// The anon key is a public client key; Row Level Security (supabase/schema.sql)
// is what actually protects user data.
// ---------------------------------------------------------------------------

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// True only when both values are present and well-formed. When false the app
// runs fully local (no account), so it still works before keys are added.
export const supabaseConfigured =
  /^https:\/\/.+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 30;
