import type { Session, SupabaseClient } from "@supabase/supabase-js";

/** Owns one provider subscription; failed initialization can be retried by auth actions. */
export function createSessionConnection(
  loadClient: () => Promise<SupabaseClient>,
  onSession: (session: Session | null) => void,
) {
  let disposed = false;
  let pending: Promise<SupabaseClient> | null = null;
  let unsubscribe: (() => void) | null = null;
  let revision = 0;

  function connect(): Promise<SupabaseClient> {
    if (disposed) return Promise.reject(new Error("Autenticación no disponible"));
    if (pending) return pending;
    pending = (async () => {
      const client = await loadClient();
      if (disposed) throw new Error("Autenticación no disponible");
      const { data } = client.auth.onAuthStateChange((_event, next) => {
        revision += 1;
        if (!disposed) onSession(next);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const initialRevision = revision;
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      // An auth event after getSession started is newer than its snapshot.
      if (!disposed && revision === initialRevision) onSession(result.data.session);
      return client;
    })().catch((error) => {
      unsubscribe?.();
      unsubscribe = null;
      pending = null;
      throw error;
    });
    return pending;
  }

  return {
    connect,
    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
