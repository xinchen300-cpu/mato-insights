// The anon/publishable key is safe to expose client-side by design (RLS is
// what actually protects data), so a hardcoded fallback here is fine — this
// must never be done for the service_role/secret key.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bjzufmvwldoltpitkrvx.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_H25QqhHqkFfRMvZSmNafLg_EYeSzWiM";
