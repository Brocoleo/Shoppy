import { FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useFavoriteIds } from "@/src/data/favorites";
import { useProducts } from "@/src/query/hooks";
import { spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { Screen } from "@/src/components/Screen";
import { ProductCard } from "@/src/components/ProductCard";
import { EmptyState } from "@/src/components/EmptyState";
import { ProductGridSkeleton } from "@/src/components/Skeletons";

export default function FavoritesScreen() {
  const theme = useTheme();
  const favoriteIds = useFavoriteIds();
  const catalog = useProducts("tendencia");
  const products = (catalog.data ?? []).filter((p) => favoriteIds.includes(p.id));

  if (catalog.data === undefined) {
    return (
      <Screen>
        {catalog.fetchStatus === "paused" ? (
          <EmptyState
            icon="wifi-outline"
            title="Sin conexión"
            message="Tus favoritos volverán solos al reconectar."
            actionLabel="Reintentar"
            onAction={() => catalog.refetch()}
          />
        ) : catalog.isError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="No pudimos cargar tus favoritos"
            message="Revisa tu conexión e inténtalo de nuevo."
            actionLabel="Reintentar"
            onAction={() => catalog.refetch()}
          />
        ) : (
          <ProductGridSkeleton />
        )}
      </Screen>
    );
  }

  if (products.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="heart-outline"
          title="Aún no guardas favoritos"
          message="Toca el corazón en las prendas que te gusten y aparecerán aquí."
          actionLabel="Explorar catálogo"
          onAction={() => router.push("/catalogo")}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={[styles.title, { color: theme.text }]}>
            Favoritos · {products.length}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <ProductCard product={item} />
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: typeScale.title, fontWeight: "700", marginBottom: spacing.md },
  list: { padding: spacing.lg, gap: spacing.md },
  columns: { gap: spacing.md },
  cell: { flex: 1 },
});
