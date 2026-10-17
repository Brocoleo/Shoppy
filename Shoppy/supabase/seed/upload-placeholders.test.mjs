import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectPlaceholders, parseArguments, uploadPlaceholders } from "./upload-placeholders.mjs";
const file = (key = "product/cover.png") => ({ key, read: () => Buffer.from("placeholder") });

test("defaults to simulation without reading files or calling transport", async () => {
  assert.deepEqual(parseArguments([]), { apply: false });
  const report = await uploadPlaceholders({ files: [{ key: "p.png", read() { throw Error("read"); } }], upload() { throw Error("write"); } });
  assert.equal(report.mode, "dry-run");
  assert.equal(report.results[0].status, "planned");
});
test("requires explicit unambiguous apply", () => {
  assert.deepEqual(parseArguments(["--apply"]), { apply: true });
  assert.deepEqual(parseArguments(["--dry-run"]), { apply: false });
  assert.throws(() => parseArguments(["--apply", "--dry-run"]));
  assert.throws(() => parseArguments(["--force"]));
});
test("create-only upload protects existing and racing objects; repeat preserves bytes", async () => {
  const remote = new Map([["real.png", Buffer.from("real photo")]]);
  const upload = async (key, bytes, options) => {
    assert.equal(options.upsert, false);
    assert.equal(options.contentType, "image/png");
    if (remote.has(key)) return { error: { statusCode: "409", message: "Already exists" } };
    remote.set(key, bytes);
    return { error: null };
  };
  const first = await uploadPlaceholders({ files: [file("real.png"), file("new.png")], apply: true, upload });
  assert.deepEqual(first.results.map((r) => r.status), ["conflict", "uploaded"]);
  assert.equal(remote.get("real.png").toString(), "real photo");
  const second = await uploadPlaceholders({ files: [file("new.png")], apply: true, upload });
  assert.equal(second.results[0].status, "conflict");
  assert.equal(remote.size, 2);
});
test("reports failures per file and continues without retrying completed uploads", async () => {
  let count = 0;
  const result = await uploadPlaceholders({ files: [file("a.png"), file("b.png"), file("c.png")], apply: true,
    async upload() { count++; if (count === 1) throw Error("offline"); if (count === 2) return { error: { statusCode: 403, message: "Denied" } }; return { error: null }; } });
  assert.deepEqual(result.results.map((r) => r.status), ["error", "error", "uploaded"]);
  assert.equal(count, 3);
});
test("validates entire batch before writes", async () => {
  for (const bad of ["../p.png", "/p.png", "a//p.png", "a\\p.png", "a/./p.png", "a.jpg"]) {
    await assert.rejects(uploadPlaceholders({ files: [file(), file(bad)], apply: true, upload() { assert.fail("write"); } }));
  }
  await assert.rejects(uploadPlaceholders({ files: [file(), file()], apply: true, upload() { assert.fail("write"); } }));
});
test("discovers PNGs recursively without following symlinks", () => {
  const dir = mkdtempSync(join(tmpdir(), "placeholder-test-"));
  try {
    mkdirSync(join(dir, "product"));
    writeFileSync(join(dir, "product", "cover.png"), "image");
    writeFileSync(join(dir, "ignore.txt"), "skip");
    symlinkSync(join(dir, "product"), join(dir, "linked"));
    const files = collectPlaceholders(dir);
    assert.deepEqual(files.map((f) => f.key), ["product/cover.png"]);
    assert.equal(files[0].read().toString(), "image");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
