import { supabase } from "@/lib/supabase";

let activeExchange: { code: string; promise: Promise<void> } | null = null;

export function exchangeCodeForSessionOnce(code: string): Promise<void> {
  if (activeExchange?.code === code) return activeExchange.promise;

  const promise = (async () => {
    if (!supabase) throw new Error("Supabase is not configured yet.");
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  })();

  activeExchange = { code, promise };
  return promise;
}
