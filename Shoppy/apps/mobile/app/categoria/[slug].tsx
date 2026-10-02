import { useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { CATEGORIES } from "@/src/data/catalog";
import { useSearchProducts } from "@/src/query/hooks";
import { spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { Chip } from "@/src/components/Chrome";
import { EmptyState } from "@/src/components/EmptyState";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/Skeletons";

export default function CategoryScreen() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const category = CATEGORIES.find((c) => c.slug === slug);
  const children = CATEGORIES.filter((c) => c.parentSlug === slug);
  const [sub, setSub] = useState<string | undefined>(undefined);

  const results = useSearchProducts({ categorySlug: sub ?? slug });

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: category?.name ?? "Categoría" }} />
      {children.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip label="Todo" selected={!sub} onPress={() => setSub(undefined)} />
          {children.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              selected={sub === c.slug}
              onPress={() => setSub(sub === c.slug ? undefined : c.slug)}
            />
          ))}
        </ScrollView>
      ) : null}
      {results.isLoading ? (
        <View style={styles.list}>
          <ProductGridSkeleton />
        </View>
      ) : (results.data ?? []).length === 0 ? (
        <EmptyState
          icon="shirt-outline"
          title={`Sin prendas en ${category?.name ?? "esta categoría"}`}
          message="Vuelve pronto: el catálogo cambia todos los días."
        />
      ) : (
        <FlatList
          data={results.data ?? []}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={[styles.count, { color: theme.muted }]}>
              {(results.data ?? []).length} prendas
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
  chips: { gap: spacing.sm, padding: spacing.lg },
  list: { padding: spacing.lg, gap: spacing.md },
  columns: { gap: spacing.md },
  cell: { flex: 1 },
  count: { fontSize: typeScale.caption, marginBottom: spacing.sm },
});
