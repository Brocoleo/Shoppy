import { useEffect, useState } from "react";
import { Image } from "expo-image";
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { productGallery } from "@/src/data/images";
import { trackProductView } from "@/src/lib/analytics";
import { useIsFavorite, useToggleFavorite } from "@/src/data/favorites";
import { useProduct, useSearchProducts } from "@/src/query/hooks";
import { useShopStore } from "@/src/stores/useShopStore";import { formatCLP, radius, spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { ConditionBadge } from "@/src/components/ConditionBadge";
import { EmptyState } from "@/src/components/EmptyState";
import { ProductRail } from "@/src/components/ProductRail";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function ProductScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Array.isArray(id) ? (id[0] ?? "") : (id ?? "");
  const product = useProduct(productId);
  const addToCart = useShopStore((s) => s.addToCart);
  const toggleFavorite = useToggleFavorite();
  const isFavorite = useIsFavorite(productId);
  const [added, setAdded] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    if (productId) trackProductView(productId);
  }, [productId]);

  const related = useSearchProducts(
    { categorySlug: product.data?.categorySlug ?? "" },
    "tendencia",
    Boolean(product.data?.categorySlug),
  );

  if (product.data === undefined) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: "Producto" }} />
        {product.fetchStatus === "paused" ? (
          <EmptyState
            icon="wifi-outline"
            title="Sin conexión"
            message="No pudimos cargar esta prenda. Se cargará sola al reconectar."
            actionLabel="Reintentar"
            onAction={() => product.refetch()}
          />
        ) : product.isError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="No pudimos cargar la prenda"
            message="Revisa tu conexión e inténtalo de nuevo."
            actionLabel="Reintentar"
            onAction={() => product.refetch()}
          />
        ) : (
          <View style={[styles.gallery, { backgroundColor: theme.surface }]} />
        )}
      </View>
    );
  }

  const p = product.data;
  if (!p) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: "Producto" }} />
        <EmptyState
          icon="shirt-outline"
          title="Prenda no encontrada"
          message="Es posible que ya se haya vendido."
        />
      </View>
    );
  }

  const gallery = productGallery(p);
  const photos = gallery;
  const relatedItems = (related.data ?? []).filter((r) => r.id !== p.id).slice(0, 6);

  const handleAdd = () => {
    if (p.stock <= 0) return;
    addToCart(p.id, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: p.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        {photos.length > 0 ? (
          <View>
            <FlatList
              data={photos}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - spacing.lg * 2));
                setPhotoIndex(i);
              }}
              renderItem={({ item }) => (
                <View>
                  <Image
                    source={item.source}
                    style={styles.photo}
                    contentFit="cover"
                    transition={200}
                    onError={(e) => console.log(`[img-detail-error] ${e.error}`)}
                  />
                  {item.isDefect ? (
                    <View style={[styles.defectTag, { backgroundColor: theme.sale }]}>
                      <Text style={styles.defectText}>Foto de detalle</Text>
                    </View>
                  ) : null}
                </View>
              )}
            />
            {photos.length > 1 ? (
              <Text style={[styles.counter, { color: theme.muted }]}>
                {photoIndex + 1} / {photos.length}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={[styles.brand, { color: theme.muted }]}>{p.brand.toUpperCase()}</Text>
        <Text style={[styles.name, { color: theme.text }]}>{p.name}</Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: theme.text }]}>{formatCLP(p.priceClp)}</Text>
          {p.compareAtPriceClp ? (
            <Text style={[styles.compare, { color: theme.muted }]}>
              {formatCLP(p.compareAtPriceClp)}
            </Text>
          ) : null}
        </View>
        <View style={styles.badgeRow}>
          <ConditionBadge condition={p.condition} />
          {p.stock <= 1 ? (
            <Text style={[styles.unique, { color: theme.sale }]}>Pieza única · solo 1 disponible</Text>
          ) : (
            <Text style={[styles.stock, { color: theme.success }]}>{p.stock} disponibles</Text>
          )}
        </View>

        <View style={[styles.specs, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
          <Spec label="Talla" value={p.size} />
          <Spec label="Color" value={p.color} />
          <Spec label="Segmento" value={p.segment ?? "—"} />
        </View>

        <Text style={[styles.section, { color: theme.text }]}>Descripción</Text>
        <Text style={[styles.description, { color: theme.text }]}>{p.description}</Text>

        {p.tags.length > 0 ? (
          <View style={styles.tags}>
            {p.tags.map((t) => (
              <Text key={t} style={[styles.tag, { color: theme.muted }]}>
                #{t}
              </Text>
            ))}
          </View>
        ) : null}

        {relatedItems.length > 0 ? (
          <View>
            <Text style={[styles.section, { color: theme.text }]}>También te puede gustar</Text>
            <ProductRail products={relatedItems} />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}
          onPress={() => toggleFavorite(p.id)}
          style={[styles.favButton, { borderColor: theme.border }]}
        >
          <Ionicons
            name={isFavorite ? "heart" : "heart-outline"}
            size={22}
            color={isFavorite ? theme.sale : theme.text}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={p.stock <= 0 ? "Agotado" : "Agregar al carrito"}
          disabled={p.stock <= 0}
          onPress={handleAdd}
          style={[styles.cta, { backgroundColor: theme.accent, opacity: p.stock <= 0 ? 0.5 : 1 }]}
        >
          <Text style={[styles.ctaText, { color: theme.onAccent }]}>
            {p.stock <= 0 ? "Agotado" : added ? "¡Agregado al carrito!" : "Agregar al carrito"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.spec}>
      <Text style={[styles.specLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.specValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  gallery: { width: "100%", height: 420, borderRadius: radius.md },
  photo: { width: SCREEN_WIDTH - spacing.lg * 2, height: 480, borderRadius: radius.md },
  counter: { fontSize: typeScale.caption, textAlign: "center", marginTop: spacing.sm },
  defectTag: {
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  defectText: { color: "#FFFFFF", fontSize: typeScale.tiny, fontWeight: "600" },
  brand: { fontSize: typeScale.caption, letterSpacing: 1.5 },
  name: { fontSize: typeScale.title, fontWeight: "700" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  price: { fontSize: 24, fontWeight: "800" },
  compare: { fontSize: typeScale.body, textDecorationLine: "line-through" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  unique: { fontSize: typeScale.caption, fontWeight: "600" },
  stock: { fontSize: typeScale.caption, fontWeight: "600" },
  specs: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: spacing.sm, gap: 2 },
  spec: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  specLabel: { fontSize: typeScale.body },
  specValue: { fontSize: typeScale.body, fontWeight: "500" },
  section: { fontSize: typeScale.headline, fontWeight: "700", marginTop: spacing.sm },
  description: { fontSize: typeScale.body, lineHeight: 22 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tag: { fontSize: typeScale.caption },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  favButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cta: {
    flex: 1,
    borderRadius: radius.pill,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontSize: typeScale.body, fontWeight: "700" },
});
