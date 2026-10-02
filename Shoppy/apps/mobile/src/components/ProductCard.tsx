import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { productCover } from "../data/images";
import { useIsFavorite, useToggleFavorite } from "../data/favorites";import type { CatalogProduct } from "../data/catalog";
import { formatCLP, radius, spacing, typeScale, useTheme } from "../theme/tokens";
import { ConditionBadge } from "./ConditionBadge";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const theme = useTheme();
  const toggleFavorite = useToggleFavorite();
  const isFavorite = useIsFavorite(product.id);
  const gallery = productCover(product);

  return (
    <Link href={{ pathname: "/producto/[id]", params: { id: product.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${formatCLP(product.priceClp)}`}
        style={styles.card}
      >
        <View>
          {gallery ? (
            <Image
              source={gallery}
              style={[styles.image, { backgroundColor: theme.imageFallback }]}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={product.id}
              transition={200}
            />
          ) : (
            <View style={[styles.image, { backgroundColor: theme.imageFallback }]} />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}
            onPress={() => toggleFavorite(product.id)}
            style={[styles.heart, { backgroundColor: theme.background }]}
            hitSlop={8}
          >
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={18}
              color={isFavorite ? theme.sale : theme.text}
            />
          </Pressable>
          {product.stock <= 1 ? (
            <View style={[styles.unique, { backgroundColor: theme.accent }]}>
              <Text style={[styles.uniqueText, { color: theme.onAccent }]}>Pieza única</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.brand, { color: theme.muted }]} numberOfLines={1}>
          {product.brand.toUpperCase()}
        </Text>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: theme.text }]}>{formatCLP(product.priceClp)}</Text>
          {product.compareAtPriceClp ? (
            <Text style={[styles.compare, { color: theme.muted }]}>
              {formatCLP(product.compareAtPriceClp)}
            </Text>
          ) : null}
        </View>
        <ConditionBadge condition={product.condition} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 4, paddingBottom: spacing.sm },
  image: { width: "100%", aspectRatio: 3 / 4, borderRadius: radius.md },
  heart: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  unique: {
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  uniqueText: { fontSize: typeScale.tiny, fontWeight: "600" },
  brand: { fontSize: typeScale.tiny, letterSpacing: 1, marginTop: spacing.sm },
  name: { fontSize: typeScale.body },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  price: { fontSize: typeScale.body, fontWeight: "700" },
  compare: { fontSize: typeScale.caption, textDecorationLine: "line-through" },
});
