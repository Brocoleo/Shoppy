import { Pressable, StyleSheet, Text } from "react-native";
import { Link, type Href } from "expo-router";
import { spacing, typeScale, useTheme } from "../theme/tokens";

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.accent : theme.border,
          backgroundColor: selected ? theme.accent : "transparent",
        },
      ]}
    >
      <Text style={[styles.label, { color: selected ? theme.onAccent : theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionHeader({
  title,
  href,
}: {
  title: string;
  href?: Href;
}) {
  const theme = useTheme();
  return (
    <>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {href ? (
        <Link href={href} asChild>
          <Pressable accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.link, { color: theme.muted }]}>Ver todo</Text>
          </Pressable>
        </Link>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    justifyContent: "center",
  },
  label: { fontSize: typeScale.caption, fontWeight: "500" },
  title: { fontSize: typeScale.title, fontWeight: "700", letterSpacing: -0.5 },
  link: { fontSize: typeScale.caption },
});
