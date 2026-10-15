import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addLine, mergeCarts, sanitizeLines, setLineQty } from "./cartStore.ts";

describe("sanitizeLines", () => {
  it("conserva líneas válidas", () => {
    assert.deepEqual(sanitizeLines([{ productId: "a", qty: 2 }]), [{ productId: "a", qty: 2 }]);
  });
  it("descarta no-arreglos y entradas inválidas", () => {
    assert.deepEqual(sanitizeLines(null), []);
    assert.deepEqual(sanitizeLines("basura"), []);
    assert.deepEqual(
      sanitizeLines([
        { productId: "ok", qty: 1 },
        { productId: "", qty: 1 },
        { productId: "x", qty: 0 },
        { productId: "y", qty: -3 },
        { productId: "z", qty: 1.5 },
        { productId: 42, qty: 1 },
        null,
        "s",
      ]),
      [{ productId: "ok", qty: 1 }],
    );
  });
  it("topa cantidades persistidas en 99", () => {
    assert.deepEqual(sanitizeLines([{ productId: "a", qty: 500 }]), [{ productId: "a", qty: 99 }]);
  });
});

describe("mergeCarts", () => {
  it("une sin duplicados con cantidad máxima", () => {
    assert.deepEqual(
      mergeCarts(
        [{ productId: "a", qty: 1 }, { productId: "b", qty: 2 }],
        [{ productId: "b", qty: 5 }, { productId: "c", qty: 1 }],
      ),
      [
        { productId: "a", qty: 1 },
        { productId: "b", qty: 5 },
        { productId: "c", qty: 1 },
      ],
    );
  });
  it("conserva el carrito propio cuando el guest está vacío y viceversa", () => {
    const mine = [{ productId: "a", qty: 3 }];
    assert.deepEqual(mergeCarts(mine, []), mine);
    assert.deepEqual(mergeCarts([], mine), mine);
    assert.deepEqual(mergeCarts([], []), []);
  });
  it("no muta las entradas", () => {
    const mine = [{ productId: "a", qty: 1 }];
    const guest = [{ productId: "a", qty: 2 }];
    mergeCarts(mine, guest);
    assert.deepEqual([mine, guest], [[{ productId: "a", qty: 1 }], [{ productId: "a", qty: 2 }]]);
  });
});

describe("addLine/setLineQty", () => {
  it("agrega y acumula con tope 99", () => {
    assert.deepEqual(addLine([], "a"), [{ productId: "a", qty: 1 }]);
    assert.deepEqual(addLine([{ productId: "a", qty: 98 }], "a", 5), [{ productId: "a", qty: 99 }]);
  });
  it("qty<=0 elimina la línea", () => {
    assert.deepEqual(setLineQty([{ productId: "a", qty: 2 }, { productId: "b", qty: 1 }], "a", 0), [
      { productId: "b", qty: 1 },
    ]);
  });
  it("fija cantidad con tope y sin mutación", () => {
    const prev = [{ productId: "a", qty: 1 }];
    assert.deepEqual(setLineQty(prev, "a", 200), [{ productId: "a", qty: 99 }]);
    assert.deepEqual(prev, [{ productId: "a", qty: 1 }]);
  });
});
