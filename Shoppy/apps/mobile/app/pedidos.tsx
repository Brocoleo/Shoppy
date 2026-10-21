import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { MOCK_ORDERS, PRODUCT_MAP } from "@/src/data/catalog";
import { isSupabaseConfigured } from "@/src/lib/supabase";
import { listMyOrders, trackGuestOrderByNumber } from "@/src/lib/checkout";
import { loadGuestOrders, type GuestOrder } from "@/src/lib/guestOrders";
import { useAuth } from "@/src/auth/AuthContext";
import { formatCLP, radius, spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { EmptyState } from "@/src/components/EmptyState";

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  PREPARING: "Preparando",
  SHIPPED: "Despachado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export default function OrdersScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const [guestId, setGuestId] = useState("");
  const [guestToken, setGuestToken] = useState("");
  const [trackError, setTrackError] = useState<string | null>(null);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Pedidos de invitado guardados en este dispositivo: sin ellos, al cerrar la
  // app el invitado no podía volver a su pedido.
  const [guestOrders, setGuestOrders] = useState<GuestOrder[]>([]);
  useEffect(() => {
    void loadGuestOrders().then(setGuestOrders);
  }, []);

  const realOrders = useQuery({
    queryKey: ["my-orders", session?.user.id ?? "guest"],
    queryFn: listMyOrders,
    enabled: isSupabaseConfigured && Boolean(session),
  });
  const ordersError = session && realOrders.isError;

  // Sin backend: mock Fase 3.
  if (!isSupabaseConfigured) {
    return <MockOrdersList />;
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      {session && realOrders.data && realOrders.data.length > 0 ? (
        <FlatList
          data={realOrders.data}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={[styles.title, { color: theme.text }]}>Mis pedidos</Text>
          }
          renderItem={({ item: order }) => (
            <Link href={{ pathname: "/pedido/[id]", params: { id: order.id } }} asChild>
              <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.card, { backgroundColor: theme.surface }])}>
                <View style={styles.head}>
                  <Text style={[styles.number, { color: theme.text }]}>{order.order_number}</Text>
                  <Text style={[styles.status, { color: theme.text }]}>{statusLabel(order.status)}</Text>
                </View>
                <Text style={[styles.total, { color: theme.text }]}>{formatCLP(order.total_clp)}</Text>
              </Pressable>
            </Link>
          )}
        />
      ) : (
        <View style={styles.list}>
          <Text style={[styles.title, { color: theme.text }]}>
            {session ? "Mis pedidos" : "Rastrear pedido"}
          </Text>
          {session && realOrders.isLoading ? (
            <Text style={{ color: theme.muted }}>Cargando…</Text>
          ) : null}
          {session && !realOrders.isLoading && (realOrders.data ?? []).length === 0 && !ordersError ? (
            <Text style={{ color: theme.muted }}>Aún no tienes pedidos.</Text>
          ) : null}
          {ordersError ? (
            <Text style={{ color: theme.sale }}>
              No pudimos cargar tus pedidos. Revisa tu conexión o tu sesión.
            </Text>
          ) : null}
          <View style={styles.tracker}>
            <Text style={[styles.trackerTitle, { color: theme.text }]}>
              {session ? "¿Compraste como invitado?" : "Compraste sin cuenta"}
            </Text>
            <Text style={[styles.trackerSub, { color: theme.muted }]}>
              Ingresa el identificador y el código que recibiste al pagar.
            </Text>
            {guestOrders.length > 0 ? (
              <View style={[styles.localOrders, { borderColor: theme.border }]}>
                <Text style={[styles.trackerTitle, { color: theme.text }]}>Tus pedidos como visita</Text>
                {guestOrders.map((o) => (
                  <Pressable
                    key={o.order_id}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: "/pedido/[id]", params: { id: o.order_id, token: o.guest_token } })}
                    style={[styles.localOrder, { borderColor: theme.border }]}
                  >
                    <Text style={[styles.number, { color: theme.text }]}>{o.order_number}</Text>
                    <Text style={{ color: theme.muted }}>Ver pedido</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <TextInput
              accessibilityLabel="Identificador del pedido"
              value={guestId}
              onChangeText={setGuestId}
              placeholder="Nº de pedido (SHO-…) o ID"
              autoCapitalize="none"
              placeholderTextColor={theme.muted}
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            />
            <TextInput
              accessibilityLabel="Código de rastreo"
              value={guestToken}
              onChangeText={setGuestToken}
              placeholder="Código de rastreo"
              autoCapitalize="none"
              placeholderTextColor={theme.muted}
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            />
            {trackError ? (
              <Text style={{ color: theme.sale }}>{trackError}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={!guestId.trim() || !guestToken.trim()}
              onPress={async () => {
                const ref = guestId.trim();
                const token = guestToken.trim();
                if (!ref || !token) return;
                setTrackError(null);
                try {
                  // El invitado conoce el número visible del pedido (SHO-XXXX);
                  // el UUID interno solo si lo tiene a mano.
                  const resolved = UUID_RE.test(ref) ? ref : (await trackGuestOrderByNumber(ref, token)).id;
                  router.push({
                    pathname: "/pedido/[id]",
                    params: { id: resolved, token },
                  });
                } catch (error) {
                  setTrackError(error instanceof Error ? error.message : "Pedido no encontrado. Verifica los datos.");
                }
              }}
              style={[styles.cta, { backgroundColor: theme.accent, opacity: !guestId.trim() || !guestToken.trim() ? 0.5 : 1 }]}
            >
              <Text style={[styles.ctaText, { color: theme.onAccent }]}>Rastrear</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function MockOrdersList() {
  const theme = useTheme();
  if (MOCK_ORDERS.length === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <EmptyState
          icon="receipt-outline"
          title="Sin pedidos todavía"
          message="Cuando compres, verás aquí el estado de tus pedidos."
        />
      </View>
    );
  }
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <FlatList
        data={MOCK_ORDERS}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: order }) => {
          const first = order.items[0];
          const firstProduct = first ? PRODUCT_MAP[first.productId] : undefined;
          return (
            <Link href={{ pathname: "/pedido/[id]", params: { id: order.id } }} asChild>
              <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.card, { backgroundColor: theme.surface }])}>
                <View style={styles.head}>
                  <Text style={[styles.number, { color: theme.text }]}>{order.orderNumber}</Text>
                  <Text style={[styles.status, { color: theme.text }]}>{statusLabel(order.status)}</Text>
                </View>
                <Text style={[styles.detail, { color: theme.muted }]} numberOfLines={1}>
                  {firstProduct ? firstProduct.name : "—"}
                  {order.items.length > 1 ? ` +${order.items.length - 1} más` : ""}
                </Text>
                <Text style={[styles.total, { color: theme.text }]}>{formatCLP(order.totalClp)}</Text>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: typeScale.title, fontWeight: "700", marginBottom: spacing.sm },
  card: { borderRadius: radius.md, padding: spacing.lg, gap: 4 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  number: { fontSize: typeScale.body, fontWeight: "700" },
  status: { fontSize: typeScale.caption, fontWeight: "600" },
  detail: { fontSize: typeScale.caption },
  total: { fontSize: typeScale.body, fontWeight: "700", marginTop: spacing.xs },
  localOrders: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  localOrder: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  tracker: { gap: spacing.sm, marginTop: spacing.md },
  trackerTitle: { fontSize: typeScale.headline, fontWeight: "700" },
  trackerSub: { fontSize: typeScale.caption },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, minHeight: 48, fontSize: typeScale.body },
  cta: { borderRadius: radius.pill, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  ctaText: { fontSize: typeScale.body, fontWeight: "700" },
});
