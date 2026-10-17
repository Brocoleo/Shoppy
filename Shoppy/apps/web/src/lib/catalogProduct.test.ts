import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapProduct, type DbProductRow } from "./catalogProduct.ts";

const row: DbProductRow = {
  id: "product", slug: "chaqueta", name: "Chaqueta", description: null,
  brand_id: "brand", category_id: "category", subcategory_id: null, segment: null,
  price_clp: 19990, compare_at_price_clp: 24990, condition: "bueno", size: null, color: null,
  stock: 1, published_at: "2026-10-01T12:00:00Z", tags: null,
  view_count: 3, favorite_count: 2, trending_score: "1.5", is_featured: true,
  brand: { slug: "marca", name: "Marca" },
  product_images: [
    { storage_path: "detail.png", sort_order: 2, is_cover: false, is_defect_detail: true },
    { storage_path: "cover.png", sort_order: 1, is_cover: true, is_defect_detail: false },
  ],
};

describe("shared product mapping", () => {
  it("preserves product values, cover order and defect photos", () => {
    const product = mapProduct(row, new Map([["category", "chaquetas"]]), (path) => `/images/${path}`);
    assert.equal(product.categorySlug, "chaquetas");
    assert.equal(product.priceClp, 19990);
    assert.equal(product.compareAtPriceClp, 24990);
    assert.equal(product.stock, 1);
    assert.equal(product.trendingScore, 1.5);
    assert.deepEqual(product.remoteImages, [{ url: "/images/cover.png", isDefect: false }, { url: "/images/detail.png", isDefect: true }]);
  });
  it("identifies only explicit demo metadata and preserves real stock", () => {
    const demo = mapProduct({ ...row, metadata: { demo: true }, stock: 0 }, new Map(), p => p);
    assert.equal(demo.isDemo, true);
    assert.equal(demo.stock, 0);
    assert.equal(mapProduct({ ...row, metadata: { demo: "true" } }, new Map(), p => p).isDemo, false);
    assert.equal(mapProduct(row, new Map(), p => p).isDemo, false);
  });
  it("supports the initial home without taxonomy and keeps client defaults", () => {
    const product = mapProduct({ ...row, brand: null, product_images: null, published_at: null }, new Map(), (path) => path);
    assert.equal(product.categorySlug, "");
    assert.equal(product.brand, "Sin marca");
    assert.equal(product.size, "Única");
    assert.equal(product.description, "");
    assert.deepEqual(product.tags, []);
    assert.equal(product.remoteImages, undefined);
    assert.equal(product.publishedAt, "1970-01-01T00:00:00.000Z");
  });
  it("preserves reservation availability independently of stock",()=>{
    const product=mapProduct({...row,availability:"RESERVED",stock:1},new Map(),p=>p);
    assert.equal(product.availability,"RESERVED");
    assert.equal(product.stock,1);
  });
});
