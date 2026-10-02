import { StyleSheet, View, type DimensionValue } from "react-native";
import { radius, spacing, useTheme } from "../theme/tokens";

function Block({ width, height, radiusValue = 4 }: { width: DimensionValue; height: number; radiusValue?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radiusValue,
        backgroundColor: theme.surface,
      }}
    />
  );
}

/** Skeleton editorial para grillas de producto (2 columnas). */
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.cell}>
          <Block width="100%" height={220} radiusValue={radius.md} />
          <Block width="60%" height={10} />
          <Block width="90%" height={12} />
          <Block width="40%" height={12} />
        </View>
      ))}
    </View>
  );
}

export function HeroSkeleton() {
  return (
    <View style={styles.hero}>
      <Block width="100%" height={300} radiusValue={radius.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  cell: { flexBasis: "48%", flexGrow: 1, gap: spacing.sm },
  hero: { paddingBottom: spacing.md },
});
