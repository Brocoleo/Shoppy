import { Image, type ImageSource } from "expo-image";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { MOCK_ORDERS, PRODUCT_MAP } from "@/src/data/catalog";
import { PRODUCT_IMAGES } from "@/src/data/productImages";
import { isSupabaseConfigured } from "@/src/lib/supabase";
import { getMyOrderDetail, trackGuestOrder } from "@/src/lib/checkout";
import { formatCLP, radius, spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { EmptyState } from "@/src/components/EmptyState";
import { statusLabel } from "../pedidos";

interface DetailItem {
  key: string;
  name: string;
  price: number;
  qty: number;
  image: ImageSource | undefined;
}

export default function OrderDetailScreen() {
  const { id, token } = useLocalSearchParams<{ id: string; token?: string }>();
  const orderId = Array.isArray(id) ? (id[0] ?? "") : (id ?? "");
  const guestToken = Array.isArray(token) ? token[0] : token;

  const guestOrder = useQuery({
    queryKey: ["guest-order", orderId],
    queryFn: () => trackGuestOrder(orderId, guestToken ?? ""),
    enabled: isSupabaseConfigured && Boolean(guestToken && orderId),
    retry: false,
  });

  const myOrder = useQuery({
    queryKey: ["my-order", orderId],
    queryFn: () => getMyOrderDetail(orderId),
    enabled: isSupabaseConfigured && !guestToken && Boolean(orderId),
    retry: false,
  });

  // Sin backend: mock Fase 3.
  if (!isSupabaseConfigured) {
    const order = MOCK_ORDERS.find((o) => o.id === orderId);
    if (!order) return <NotFound />;
    const items: DetailItem[] = order.items.map((item) => {
      const p = PRODUCT_MAP[item.productId];
      return {
        key: item.productId,
        name: p ? p.name : item.productId,
        price: item.unitPriceClp,
        qty: item.qty,
        image: p ? PRODUCT_IMAGES[p.slug]?.cover : undefined,
      };
    });
    return (
      <DetailView
        title={order.orderNumber}
        status={order.status}
        sub={`${formatCLP(order.totalClp)}${order.carrier ? ` · ${order.carrier}` : ""}${order.trackingNumber ? ` · Seguimiento ${order.trackingNumber}` : ""}`}
        steps={order.history.map((h) => ({ title: statusLabel(h.status), date: h.at }))}
        items={items}
      />
    );
  }

  if (guestToken) {
    if (guestOrder.data === undefined) {
      if (guestOrder.fetchStatus === "paused") {
        return <NotFound message="Sin conexión. Se cargará solo al reconectar." actionLabel="Reintentar" onAction={() => guestOrder.refetch()} />;
      }
      if (guestOrder.isError) {
        return <NotFound message="Verifica el identificador y el código de rastreo." actionLabel="Reintentar" onAction={() => guestOrder.refetch()} />;
      }
      return <LoadingView />;
    }
    if (!guestOrder.data) {
      return <NotFound message="Verifica el identificador y el código de rastreo." />;
    }
    const g = guestOrder.data;
    return (
      <DetailView
        title={g.order_number || orderId}
        status={g.status}
        sub={formatCLP(g.total_clp)}
        steps={[{ title: statusLabel(g.status), date: "" }]}
        items={g.items.map((i, idx) => ({
          key: `${i.product_slug}-${idx}`,
          name: i.product_name,
          price: i.unit_price_clp,
          qty: i.qty,
          image: i.image_url ? { uri: i.image_url } : undefined,
        }))}
      />
    );
  }

  if (myOrder.data === undefined) {
    if (myOrder.fetchStatus === "paused") {
      return <NotFound message="Sin conexión. Se cargará solo al reconectar." actionLabel="Reintentar" onAction={() => myOrder.refetch()} />;
    }
    if (myOrder.isError) return <NotFound actionLabel="Reintentar" onAction={() => myOrder.refetch()} />;
    return <LoadingView />;
  }
  if (!myOrder.data) return <NotFound />;
  const o = myOrder.data;
  return (
    <DetailView
      title={o.order_number}
      status={o.status}
      sub={`${formatCLP(o.total_clp)}${o.carrier ? ` · ${o.carrier}` : ""}${o.tracking_number ? ` · Seguimiento ${o.tracking_number}` : ""}`}
      trackingUrl={o.tracking_url}
      steps={o.history.map((h) => ({ title: statusLabel(h.to_status), date: h.created_at }))}
      items={o.items.map((i, idx) => ({
        key: `${i.product_slug}-${idx}`,
        name: i.product_name,
        price: i.unit_price_clp,
        qty: i.qty,
        image: i.image_url ? { uri: i.image_url } : undefined,
      }))}
    />
  );
}

function DetailView({
  title,
  status,
  sub,
  steps,
  items,
  trackingUrl = null,
}: {
  title: string;
  status: string;
  sub: string;
  steps: { title: string; date: string }[];
  items: DetailItem[];
  trackingUrl?: string | null;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.status, { color: theme.text }]}>{statusLabel(status)}</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>{sub}</Text>
          {trackingUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(trackingUrl)}
              hitSlop={8}
            >
              <Text style={[styles.tracking, { color: theme.text }]}>Seguir en transportista ↗</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.section, { color: theme.text }]}>Seguimiento</Text>
        <View>
          {steps.map((s, i) => (
            <View key={`${s.title}-${i}`} style={styles.step}>
              <View style={styles.rail}>
                <Ionicons
                  name={i === steps.length - 1 ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={theme.text}
                />
                {i < steps.length - 1 ? <View style={[styles.line, { backgroundColor: theme.border }]} /> : null}
              </View>
              <View style={styles.stepInfo}>
                <Text style={[styles.stepTitle, { color: theme.text }]}>{s.title}</Text>
                {s.date ? (
                  <Text style={[styles.stepDate, { color: theme.muted }]}>
                    {new Date(s.date).toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.section, { color: theme.text }]}>Prendas</Text>
        {items.map((item) => (
          <View key={item.key} style={styles.item}>
            {item.image !== undefined ? (
              <Image
                source={item.image}
                style={[styles.thumb, { backgroundColor: theme.imageFallback }]}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.imageFallback }]}>
                <Text style={[styles.thumbFallbackText, { color: theme.muted }]}>Sin foto</Text>
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={[styles.itemPrice, { color: theme.muted }]}>
                {item.qty} × {formatCLP(item.price)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function LoadingView() {
  const theme = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: "Pedido" }} />
      <Text style={[styles.loading, { color: theme.muted }]}>Cargando pedido…</Text>
    </View>
  );
}

function NotFound({ message = "Verifica el identificador e inténtalo de nuevo.", actionLabel, onAction }: { message?: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: "Pedido" }} />
      <EmptyState icon="receipt-outline" title="Pedido no encontrado" message={message} actionLabel={actionLabel} onAction={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  loading: { padding: spacing.lg, fontSize: typeScale.body },
  card: { borderRadius: radius.md, padding: spacing.lg, gap: 4 },
  status: { fontSize: typeScale.headline, fontWeight: "700" },
  sub: { fontSize: typeScale.caption },
  tracking: { fontSize: typeScale.body, fontWeight: "600", textDecorationLine: "underline" },
  section: { fontSize: typeScale.headline, fontWeight: "700", marginTop: spacing.sm },
  step: { flexDirection: "row", gap: spacing.md },
  rail: { alignItems: "center" },
  line: { width: 1, flex: 1, minHeight: 20 },
  stepInfo: { paddingBottom: spacing.lg, gap: 2 },
  stepTitle: { fontSize: typeScale.body, fontWeight: "600" },
  stepDate: { fontSize: typeScale.caption },
  item: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  thumb: { width: 56, height: 72, borderRadius: radius.sm },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  thumbFallbackText: { fontSize: typeScale.tiny },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: typeScale.body },
  itemPrice: { fontSize: typeScale.caption },
});
