import { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { ProductCondition } from "@shopy/types";
import { CONDITION_LABELS } from "@/src/theme/tokens";
import { useCategories, useSearchProducts, useSizes } from "@/src/query/hooks";
import type { ProductSort } from "@/src/data/repository";
import { spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { Screen } from "@/src/components/Screen";
import { SearchBar } from "@/src/components/Inputs";
import { Chip } from "@/src/components/Chrome";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/Skeletons";
import { EmptyState } from "@/src/components/EmptyState";

const SORTS: { key: ProductSort; label: string }[] = [
  { key: "tendencia", label: "Tendencia" },
  { key: "novedades", label: "Novedades" },
  { key: "precio-asc", label: "Precio ↑" },
  { key: "precio-desc", label: "Precio ↓" },
];

const CONDITIONS: ProductCondition[] = ["como_nuevo", "excelente", "bueno", "con_detalles"];

export default function SearchScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ brand?: string }>();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProductSort>("tendencia");
  const [categorySlug, setCategorySlug] = useState<string | undefined>(undefined);
  const [brandSlug, setBrandSlug] = useState<string | undefined>(
    Array.isArray(params.brand) ? params.brand[0] : params.brand,
  );
  const [condition, setCondition] = useState<ProductCondition | undefined>(undefined);
  const [size, setSize] = useState<string | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const b = Array.isArray(params.brand) ? params.brand[0] : params.brand;
    setBrandSlug(b);
  }, [params.brand]);

  const filters = useMemo(
    () => ({
      ...(query ? { query } : {}),
      ...(categorySlug ? { categorySlug } : {}),
      ...(brandSlug ? { brandSlug } : {}),
      ...(condition ? { condition } : {}),
      ...(size ? { size } : {}),
    }),
    [query, categorySlug, brandSlug, condition, size],
  );

  const results = useSearchProducts(filters, sort);
  const categories = useCategories();
  const sizes = useSizes();
  const hasFilters = Boolean(query || categorySlug || brandSlug || condition || size);

  const clearAll = () => {
    setText("");
    setQuery("");
    setCategorySlug(undefined);
    setBrandSlug(undefined);
    setCondition(undefined);
    setSize(undefined);
  };

  return (
    <Screen padded={false}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
        <Text style={[styles.title, { color: theme.text }]}>Buscar</Text>
        <SearchBar value={text} onChange={setText} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          <Chip label="Todo" selected={!categorySlug} onPress={() => setCategorySlug(undefined)} />
          {(categories.data ?? [])
            .filter((c) => c.parentSlug === null)
            .map((c) => (
              <Chip
                key={c.slug}
                label={c.name}
                selected={categorySlug === c.slug}
                onPress={() => setCategorySlug(categorySlug === c.slug ? undefined : c.slug)}
              />
            ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {CONDITIONS.map((c) => (
            <Chip
              key={c}
              label={CONDITION_LABELS[c] ?? c}
              selected={condition === c}
              onPress={() => setCondition(condition === c ? undefined : c)}
            />
          ))}
          {(sizes.data ?? []).slice(0, 8).map((s) => (
            <Chip
              key={s}
              label={`Talla ${s}`}
              selected={size === s}
              onPress={() => setSize(size === s ? undefined : s)}
            />
          ))}
        </ScrollView>
        {brandSlug ? (
          <Chip label={`Marca: ${brandSlug} ✕`} selected onPress={() => setBrandSlug(undefined)} />
        ) : null}
      </View>

      {results.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <ProductGridSkeleton />
        </View>
      ) : results.isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Error al buscar"
          message="Inténtalo de nuevo."
          actionLabel="Reintentar"
          onAction={() => results.refetch()}
        />
      ) : (results.data ?? []).length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="Sin resultados"
          message={
            hasFilters
              ? "Prueba con otra palabra o quita filtros."
              : "Escribe para buscar en el catálogo."
          }
          actionLabel={hasFilters ? "Limpiar filtros" : undefined}
          onAction={hasFilters ? clearAll : undefined}
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
              {hasFilters ? " · " : ""}
              {hasFilters ? <Text onPress={clearAll}>limpiar</Text> : null}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <ProductCard product={item} />
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  title: { fontSize: typeScale.title, fontWeight: "700" },
  row: { gap: spacing.sm, paddingVertical: 2 },
  list: { padding: spacing.lg, gap: spacing.md },
  columns: { gap: spacing.md },
  cell: { flex: 1 },
  count: { fontSize: typeScale.caption, marginBottom: spacing.sm },
});
