import { StyleSheet, Text, View } from "react-native";
import { radius, spacing, typeScale, useTheme } from "../theme/tokens";

export function ConditionBadge({ condition }: { condition: string }) {
  const theme = useTheme();
  const highlight = condition === "con_detalles";
  return (
    <View
      style={[
        styles.pill,
        {
          borderColor: highlight ? theme.sale : theme.border,
          backgroundColor: theme.background,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: highlight ? theme.sale : theme.muted },
        ]}
      >
        {conditionLabel(condition)}
      </Text>
    </View>
  );
}

export function conditionLabel(condition: string): string {
  switch (condition) {
    case "como_nuevo":
      return "Como nuevo";
    case "excelente":
      return "Excelente";
    case "bueno":
      return "Bueno";
    case "con_detalles":
      return "Con detalles";
    default:
      return condition;
  }
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  label: { fontSize: typeScale.tiny, fontWeight: "500" },
});
