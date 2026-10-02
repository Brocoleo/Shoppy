import { FlatList, StyleSheet, View } from "react-native";
import type { CatalogProduct } from "../data/catalog";
import { spacing } from "../theme/tokens";
import { ProductCard } from "./ProductCard";

/** Riel horizontal de productos (ancho fijo por tarjeta). */
export function ProductRail({ products }: { products: CatalogProduct[] }) {
  return (
    <FlatList
      data={products}
      keyExtractor={(p) => p.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <View style={styles.cell}>
          <ProductCard product={item} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingRight: spacing.lg },
  cell: { width: 160 },
});
