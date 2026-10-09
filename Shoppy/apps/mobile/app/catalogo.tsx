import { useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { useProducts } from "@/src/query/hooks";
import type { ProductSort } from "@/src/data/repository";
import { spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { Chip } from "@/src/components/Chrome";
import { EmptyState } from "@/src/components/EmptyState";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/Skeletons";

const SORTS: { key: ProductSort; label: string }[] = [
  { key: "tendencia", label: "Tendencia" },
  { key: "novedades", label: "Novedades" },
  { key: "precio-asc", label: "Precio ↑" },
  { key: "precio-desc", label: "Precio ↓" },
];

export default function CatalogScreen() {
  const theme = useTheme();
  const [sort, setSort] = useState<ProductSort>("tendencia");
  const products = useProducts(sort);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sorts}
      >
        {SORTS.map((s) => (
          <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
        ))}
      </ScrollView>
      {products.data === undefined ? (
        products.fetchStatus === "paused" ? (
          <EmptyState
            icon="wifi-outline"
            title="Sin conexión"
            message="No pudimos actualizar el catálogo. Revisa tu red: se cargará solo al reconectar."
            actionLabel="Reintentar"
            onAction={() => products.refetch()}
          />
        ) : products.isError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="No pudimos cargar el catálogo"
            message="Revisa tu conexión e inténtalo de nuevo."
            actionLabel="Reintentar"
            onAction={() => products.refetch()}
          />
        ) : (
          <View style={styles.list}>
            <ProductGridSkeleton />
          </View>
        )
      ) : (
        <FlatList
          data={products.data ?? []}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={[styles.count, { color: theme.muted }]}>
              {(products.data ?? []).length} prendas únicas
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
  sorts: { gap: spacing.sm, padding: spacing.lg },
  list: { padding: spacing.lg, gap: spacing.md },
  columns: { gap: spacing.md },
  cell: { flex: 1 },
  count: { fontSize: typeScale.caption, marginBottom: spacing.sm },
});
