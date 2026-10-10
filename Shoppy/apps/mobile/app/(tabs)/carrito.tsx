import { useState } from "react";
import { Image } from "expo-image";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { productCover } from "@/src/data/images";
import { isSupabaseConfigured } from "@/src/lib/supabase";
import { useProducts, useValidatedCart } from "@/src/query/hooks";
import { useShopStore } from "@/src/stores/useShopStore";
import { formatCLP, radius, spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { Screen } from "@/src/components/Screen";
import { EmptyState } from "@/src/components/EmptyState";
import { QtyStepper } from "@/src/components/Inputs";
import { ProductGridSkeleton } from "@/src/components/Skeletons";

const LINE_MESSAGES: Record<string, string> = {
  adjusted: "Cantidad ajustada al stock",
  out_of_stock: "Sin stock",
  unavailable: "Ya no disponible",
};

export default function CartScreen() {
  const theme = useTheme();
  const cart = useShopStore((s) => s.cart);
  const setQty = useShopStore((s) => s.setQty);
  const catalog = useProducts("tendencia");
  const validation = useValidatedCart(cart);
  const [notice, setNotice] = useState<string | null>(null);

  const productsById = new Map((catalog.data ?? []).map((p) => [p.id, p]));
  const validatedById = new Map((validation.data?.lines ?? []).map((l) => [l.productId, l]));

  if (cart.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="bag-outline"
          title="Tu carrito está vacío"
          message="Las prendas son únicas: si te gusta algo, no lo dejes pasar."
          actionLabel="Explorar catálogo"
          onAction={() => router.push("/catalogo")}
        />
      </Screen>
    );
  }

  if (catalog.data === undefined) {
    return (
      <Screen>
        {catalog.fetchStatus === "paused" ? (
          <EmptyState
            icon="wifi-outline"
            title="Sin conexión"
            message="No pudimos verificar precios y stock. Se actualizará solo al reconectar."
            actionLabel="Reintentar"
            onAction={() => catalog.refetch()}
          />
        ) : catalog.isError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="No pudimos cargar el carrito"
            message="Revisa tu conexión e inténtalo de nuevo."
            actionLabel="Reintentar"
            onAction={() => catalog.refetch()}
          />
        ) : (
          <ProductGridSkeleton count={3} />
        )}
      </Screen>
    );
  }

  const subtotal = isSupabaseConfigured
    ? (validation.data?.subtotalClp ?? 0)
    : cart.reduce((n, l) => n + (productsById.get(l.productId)?.priceClp ?? 0) * l.qty, 0);
  const hasIssues = validation.data?.hasIssues ?? false;

  return (
    <Screen padded={false}>
      <FlatList
        data={cart}
        keyExtractor={(l) => l.productId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={[styles.title, { color: theme.text }]}>Carrito · {cart.length}</Text>
            {validation.isFetching ? (
              <Text style={[styles.sync, { color: theme.muted }]}>Verificando stock y precios…</Text>
            ) : null}
            {isSupabaseConfigured && validation.isError ? (
              <Text style={[styles.sync, { color: theme.sale }]}>
                Sin conexión al backend: precios referenciales.
              </Text>
            ) : null}
          </>
        }
        renderItem={({ item: line }) => {
          const product = productsById.get(line.productId);
          const validated = validatedById.get(line.productId);
          const cover = product ? productCover(product) : undefined;
          const price = validated?.unitPriceClp ?? product?.priceClp ?? 0;
          const status = validated?.status ?? "ok";
          const blocked = status === "unavailable" || status === "out_of_stock";

          return (
            <View style={styles.row}>
              {cover ? (
                <Image
                  source={cover}
                  style={[styles.thumb, { backgroundColor: theme.imageFallback }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.thumb, { backgroundColor: theme.imageFallback }]} />
              )}
              <View style={styles.info}>
                <Text style={[styles.brand, { color: theme.muted }]}>
                  {(product?.brand ?? "—").toUpperCase()}
                </Text>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
                  {product?.name ?? "Prenda no disponible"}
                </Text>
                <Text style={[styles.price, { color: theme.text }]}>{formatCLP(price)}</Text>
                {status !== "ok" ? (
                  <Text style={[styles.issue, { color: theme.sale }]}>
                    {LINE_MESSAGES[status] ?? status}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  {!blocked && product ? (
                    <QtyStepper
                      qty={validated?.qty ?? line.qty}
                      onChange={(q) => setQty(line.productId, Math.min(q, validated?.stock ?? product.stock))}
                    />
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Quitar del carrito"
                    onPress={() => setQty(line.productId, 0)}
                    hitSlop={8}
                  >
                    <Text style={[styles.remove, { color: theme.muted }]}>Quitar</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.muted }]}>Subtotal</Text>
              <Text style={[styles.total, { color: theme.text }]}>{formatCLP(subtotal)}</Text>
            </View>
            <Text style={[styles.hint, { color: theme.muted }]}>
              {isSupabaseConfigured
                ? "Precios y stock verificados en backend. El despacho se calcula en el checkout."
                : "El despacho se calcula en el checkout según tu comuna."}
            </Text>
            {notice ? <Text style={[styles.notice, { color: theme.warning }]}>{notice}</Text> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (hasIssues) {
                  setNotice("Ajusta o quita las prendas marcadas antes de continuar.");
                  return;
                }
                if (!isSupabaseConfigured) {
                  setNotice("Conecta Supabase (apps/mobile/.env) para comprar.");
                  return;
                }
                setNotice(null);
                router.push("/checkout");
              }}
              style={[styles.cta, { backgroundColor: theme.accent }]}
            >
              <Text style={[styles.ctaText, { color: theme.onAccent }]}>Continuar al checkout</Text>
            </Pressable>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.lg },
  title: { fontSize: typeScale.title, fontWeight: "700" },
  sync: { fontSize: typeScale.caption, marginTop: spacing.xs },
  row: { flexDirection: "row", gap: spacing.md },
  thumb: { width: 84, height: 112, borderRadius: radius.md },
  info: { flex: 1, gap: 2 },
  brand: { fontSize: typeScale.tiny, letterSpacing: 1 },
  name: { fontSize: typeScale.body },
  price: { fontSize: typeScale.body, fontWeight: "700" },
  issue: { fontSize: typeScale.caption, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  remove: { fontSize: typeScale.caption, textDecorationLine: "underline" },
  footer: { borderTopWidth: 1, paddingTop: spacing.lg, gap: spacing.sm },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  totalLabel: { fontSize: typeScale.body },
  total: { fontSize: typeScale.title, fontWeight: "800" },
  hint: { fontSize: typeScale.caption },
  notice: { fontSize: typeScale.caption },
  cta: { borderRadius: radius.pill, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  ctaText: { fontSize: typeScale.body, fontWeight: "700" },
});
