export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const demoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  (!supabaseUrl && !supabaseKey);
export const configurationError =
  !demoMode && (!supabaseUrl || !supabaseKey)
    ? "Supabase setup is incomplete. Set both the project URL and public anon key, or enable demo mode."
    : null;
