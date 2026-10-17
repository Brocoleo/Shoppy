import process from "node:process";
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const roots = ["apps/mobile/tests", "supabase/tests"];
const tests = roots.flatMap((root) => {
  const files = existsSync(root)
    ? readdirSync(root)
        .filter((name) => name.endsWith(".test.mjs"))
        .map((name) => `${root}/${name}`)
    : [];
  if (!files.length)
    throw new Error(
      `No hay pruebas beta en ${root}; no se acepta una ejecución vacía.`,
    );
  return files;
});
const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
