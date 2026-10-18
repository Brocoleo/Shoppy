/**
 * Config pública del backend, SIN dependencias de runtime.
 * Los módulos que solo necesitan comprobar configuración deben importar
 * de acá para no arrastrar @supabase/supabase-js al bundle crítico.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
