import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, router, type Href } from "expo-router";
import { PRODUCT_IMAGES } from "@/src/data/productImages";
import type { CatalogProduct } from "@/src/data/catalog";
import { productCover } from "@/src/data/images";
import { useBrands, useCategories, useCollection, useProducts, useProductsByIds } from "@/src/query/hooks";
import { radius, spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { EmptyState } from "@/src/components/EmptyState";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductRail } from "@/src/components/ProductRail";
import { HeroSkeleton, ProductGridSkeleton } from "@/src/components/Skeletons";

const HERO_PRODUCT_SLUG = "chaqueta-trucker-levis";

export default function HomeScreen() {
  const theme = useTheme();
  const newcomers = useProducts("novedades");
  const trending = useProducts("tendencia");
  const categories = useCategories();
  const brands = useBrands();
  const offers = useCollection("ofertas");
  const picks = useCollection("novedades");

  // Resolver colecciones contra backend con 1 sola query (no N+1).
  const collectionIds = [...new Set([...(offers.data?.productIds ?? []), ...(picks.data?.productIds ?? [])])];
  const collectionProducts = useProductsByIds(collectionIds);
  const byId = new Map((collectionProducts.data ?? []).map((p) => [p.id, p]));
  const inList = (ids: string[], list: CatalogProduct[]): CatalogProduct[] => {
    const fromList = ids
      .map((id) => list.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    if (fromList.length > 0) return fromList;
    return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => p !== undefined);
  };

  const newcomersData = newcomers.data;
  const trendingData = trending.data;
  const paused = !newcomersData && newcomers.fetchStatus === "paused";
  const pausedT = !trendingData && trending.fetchStatus === "paused";
  const failed = newcomers.isError || trending.isError;

  if (!newcomersData || !trendingData) {
    if (paused || pausedT) {
      return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <EmptyState
            icon="wifi-outline"
            title="Sin conexión"
            message="No pudimos actualizar la tienda. Se cargará sola al reconectar."
            actionLabel="Reintentar"
            onAction={() => {
              newcomers.refetch();
              trending.refetch();
            }}
          />
        </View>
      );
    }
    if (failed) {
      return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <EmptyState
            icon="cloud-offline-outline"
            title="No pudimos cargar la tienda"
            message="Revisa tu conexión e inténtalo de nuevo."
            actionLabel="Reintentar"
            onAction={() => {
              newcomers.refetch();
              trending.refetch();
            }}
          />
        </View>
      );
    }
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ padding: spacing.lg }}>
          <HeroSkeleton />
          <ProductGridSkeleton count={4} />
        </View>
      </ScrollView>
    );
  }

  const heroGallery = PRODUCT_IMAGES[HERO_PRODUCT_SLUG];
  const heroProduct =
    [...newcomersData, ...trendingData].find((p) => p.slug === HERO_PRODUCT_SLUG) ??
    newcomersData[0];
  const heroSource = heroProduct ? productCover(heroProduct) : heroGallery?.cover;
  const offerProducts = inList(offers.data?.productIds ?? [], trendingData);
  const pickProducts = inList(picks.data?.productIds ?? [], newcomersData);
  const parentCategories = (categories.data ?? []).filter((c) => c.parentSlug === null);
  const brandSlugs = (brands.data ?? []).map((b) => b.slug);
  const visibleBrands = (brandSlugs.length > 0 ? brandSlugs : ["levis", "nike", "adidas", "zara", "lacoste"]).slice(0, 8);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.wordmark, { color: theme.text }]}>SHOPY</Text>
      <Text style={[styles.tagline, { color: theme.muted }]}>
        Ropa de segunda mano · Chile
      </Text>

      {/* Hero configurable (Fase 3: primer destacado; admin lo controla en Fase 7) */}
      <Link href={{ pathname: "/coleccion/[slug]", params: { slug: "novedades" } }} asChild>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver novedades">
          {heroSource ? (
            <Image
              source={heroSource}
              style={styles.heroImage}
              contentFit="cover"
              transition={200}
            />
          ) : null}
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle}>Segunda mano,{'\n'}primera opción</Text>
            <Text style={styles.heroSubtitle}>Prendas únicas seleccionadas en Chile</Text>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>Ver novedades</Text>
            </View>
          </View>
        </Pressable>
      </Link>

      <SectionRow title="Recién llegados" href="/catalogo">
        <ProductRail products={newcomersData.slice(0, 8)} />
      </SectionRow>

      <SectionRow title="Tendencias" href="/catalogo">
        <ProductRail products={trendingData.slice(0, 8)} />
      </SectionRow>

      <View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Categorías</Text>
        <View style={styles.chipGrid}>
          {parentCategories.map((c) => (
            <Link
              key={c.slug}
              href={{ pathname: "/categoria/[slug]", params: { slug: c.slug } }}
              asChild
            >
              <Pressable
                accessibilityRole="button"
                style={StyleSheet.flatten([styles.categoryCard, { backgroundColor: theme.surface }])}
              >
                <Text style={[styles.categoryName, { color: theme.text }]}>{c.name}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>

      <View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Marcas destacadas</Text>
        <View style={styles.chipGrid}>
          {visibleBrands.map((slug) => (
            <Pressable
              key={slug}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/(tabs)/buscar", params: { brand: slug } })
              }
              style={[styles.brandChip, { borderColor: theme.border }]}
            >
              <Text style={[styles.brandName, { color: theme.text }]}>
                {brandName(slug)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <SectionRow title="Selección Shopy" href="/coleccion/novedades">
        <View style={styles.grid}>
          {pickProducts.map((p) => (
            <View key={p.id} style={styles.gridCell}>
              <ProductCard product={p} />
            </View>
          ))}
        </View>
      </SectionRow>

      {offerProducts.length > 0 ? (
        <SectionRow title="Ofertas" href="/coleccion/ofertas">
          <ProductRail products={offerProducts} />
        </SectionRow>
      ) : null}

      <Text style={[styles.footer, { color: theme.muted }]}>
        Precios en CLP · Despacho a todo Chile
      </Text>
    </ScrollView>
  );
}

function SectionRow({
  title,
  href,
  children,
}: {
  title: string;
  href: Href;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <Link href={href} asChild>
          <Pressable accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.seeAll, { color: theme.muted }]}>Ver todo</Text>
          </Pressable>
        </Link>
      </View>
      {children}
    </View>
  );
}

function brandName(slug: string): string {
  const map: Record<string, string> = {
    levis: "Levi's",
    nike: "Nike",
    adidas: "Adidas",
    zara: "Zara",
    lacoste: "Lacoste",
  };
  return map[slug] ?? slug;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  wordmark: { fontSize: typeScale.hero, fontWeight: "800", letterSpacing: 4 },
  tagline: { fontSize: typeScale.body, marginTop: -spacing.md },
  heroImage: { width: "100%", height: 380, borderRadius: radius.md },
  heroOverlay: { position: "absolute", left: spacing.lg, bottom: spacing.lg, gap: spacing.sm },
  heroTitle: { fontSize: 30, fontWeight: "800", color: "#FFFFFF", lineHeight: 34 },
  heroSubtitle: { fontSize: typeScale.body, color: "#FFFFFF" },
  heroCta: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: "center",
  },
  heroCtaText: { color: "#111111", fontWeight: "700" },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: typeScale.title, fontWeight: "700", letterSpacing: -0.5 },
  seeAll: { fontSize: typeScale.caption },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  categoryCard: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    minWidth: "30%",
    flexGrow: 1,
  },
  categoryName: { fontSize: typeScale.body, fontWeight: "600" },
  brandChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: "center",
  },
  brandName: { fontSize: typeScale.body, fontWeight: "500" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridCell: { flexBasis: "47%", flexGrow: 1 },
  footer: { fontSize: typeScale.caption, textAlign: "center", paddingTop: spacing.md },
});
