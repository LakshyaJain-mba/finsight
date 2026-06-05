import { createClient, SupabaseClient } from '@supabase/supabase-js';

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

let browserClient: SupabaseClient | null = null;

/**
 * Browser/anon client (RLS-governed). Created lazily so that importing this
 * module never throws at build time when env vars are absent. Safe for client
 * components and read paths.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      env('NEXT_PUBLIC_SUPABASE_URL'),
      env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    );
  }
  return browserClient;
}

/**
 * Server-only client backed by the service role key. Bypasses RLS, so it must
 * never be imported into client components. Instantiated per request inside
 * route handlers and server components.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
