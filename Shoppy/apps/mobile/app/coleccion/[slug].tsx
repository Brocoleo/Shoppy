import { FlatList, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { queryKeys } from "@/src/query/client";
import { catalogRepository } from "@/src/data/repository";
import { useCollection } from "@/src/query/hooks";
import { spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { EmptyState } from "@/src/components/EmptyState";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/Skeletons";

export default function CollectionScreen() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const collection = useCollection(Array.isArray(slug) ? (slug[0] ?? "") : (slug ?? ""));

  const ids = collection.data?.productIds ?? [];
  const productQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.product(id),
      queryFn: () => catalogRepository.getProduct(id),
    })),
  });
  const products = productQueries
    .map((q) => q.data)
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
  const productsPending =
    collection.isLoading || productQueries.some((q) => q.isPending);
  const productsError = productQueries.some((q) => q.isError);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: collection.data?.name ?? "Colección" }} />
      {productsPending ? (
        <View style={styles.list}>
          <ProductGridSkeleton />
        </View>
      ) : collection.isError || productsError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="No pudimos cargar la colección"
          message="Revisa tu conexión e inténtalo de nuevo."
          actionLabel="Reintentar"
          onAction={() => {
            collection.refetch();
            productQueries.forEach((q) => q.refetch());
          }}
        />
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
