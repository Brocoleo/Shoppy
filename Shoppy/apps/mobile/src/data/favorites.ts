/**
 * Favoritos unificados (Fase 4): remotos (Supabase) si hay sesión,
 * locales (zustand) en caso contrario. Misma API para la UI.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { useShopStore } from "../stores/useShopStore";

async function fetchRemoteFavorites(userId: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("favorites")
    .select("product_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r: { product_id: string }) => r.product_id);
}

export function useFavoriteIds(): string[] {
  const { session } = useAuth();
  const local = useShopStore((s) => s.favorites);
  const remote = useQuery({
    queryKey: ["favorites", session?.user.id ?? "guest"],
    queryFn: () => fetchRemoteFavorites(session?.user.id ?? ""),
    enabled: isSupabaseConfigured && Boolean(session),
    staleTime: 30_000,
  });
  if (!isSupabaseConfigured || !session) return local;
  return remote.data ?? local;
}

export function useIsFavorite(productId: string): boolean {
  return useFavoriteIds().includes(productId);
}

export function useToggleFavorite(): (productId: string) => void {
  const { session } = useAuth();
  const toggleLocal = useShopStore((s) => s.toggleFavorite);
  const queryClient = useQueryClient();

  const remote = useMutation({
    mutationFn: async ({ productId, isFav }: { productId: string; isFav: boolean }) => {
      const supabase = getSupabase();
      const userId = session?.user.id ?? "";
      if (isFav) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("product_id", productId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: userId, product_id: productId });
        if (error) throw error;
      }
    },
    onMutate: async ({ productId, isFav }) => {
      const key = ["favorites", session?.user.id ?? "guest"];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<string[]>(key) ?? [];
      queryClient.setQueryData<string[]>(
        key,
        isFav ? prev.filter((id) => id !== productId) : [...prev, productId],
      );
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites", session?.user.id ?? "guest"] });
    },
  });

  return (productId: string) => {
    if (!isSupabaseConfigured || !session) {
      toggleLocal(productId);
      return;
    }
    const ids = queryClient.getQueryData<string[]>(["favorites", session.user.id])
      ?? useShopStore.getState().favorites;
    remote.mutate({ productId, isFav: ids.includes(productId) });
  };
}
