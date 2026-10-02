import { FlatList, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { PRODUCT_MAP } from "@/src/data/catalog";
import { useCollection } from "@/src/query/hooks";
import { spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { EmptyState } from "@/src/components/EmptyState";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/Skeletons";

export default function CollectionScreen() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const collection = useCollection(Array.isArray(slug) ? (slug[0] ?? "") : (slug ?? ""));

  const products = (collection.data?.productIds ?? [])
    .map((id) => PRODUCT_MAP[id])
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: collection.data?.name ?? "Colección" }} />
      {collection.isLoading ? (
        <View style={styles.list}>
          <ProductGridSkeleton />
        </View>
      ) : !collection.data ? (
        <EmptyState
          icon="albums-outline"
          title="Colección no encontrada"
          message="Es posible que ya no esté disponible."
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={[styles.count, { color: theme.muted }]}>
              {products.length} prendas seleccionadas
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <ProductCard product={item} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md },
  columns: { gap: spacing.md },
  cell: { flex: 1 },
  count: { fontSize: typeScale.caption, marginBottom: spacing.sm },
});
