import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoMode, supabaseKey, supabaseUrl } from "./config";
let client: SupabaseClient | null = null;
export function getSupabase() {
  if (demoMode || !supabaseUrl || !supabaseKey)
    throw new Error("Cloud storage is not configured.");
  client ??= createClient(supabaseUrl, supabaseKey);
  return client;
}
