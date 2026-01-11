import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

export const createSupabaseServerClient = () => {
  const url = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
    },
  });
};
