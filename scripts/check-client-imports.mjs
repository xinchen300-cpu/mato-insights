// A server file may render a component from a "use client" module, but any
// other value it takes from there (a list, a constant, a helper) arrives as a
// stand-in, not as itself. On 19-10-2026 `PERIODS.map is not a function` broke
// the live overview that way, while the build and the previews were fine.
// This check fails the run instead. Part of: npm run check:guards
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const SRC = new URL("../src", import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const isClient = (source) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(source);

function resolveImport(from, spec) {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** What a client module exports that is not a component: values and lower-case functions. */
function nonComponents(source) {
  const names = new Set();
  for (const [, name] of source.matchAll(/export (?:const|let|var) (\w+)\s*(?::[^=]+)?=\s*([^\n]*)/g)) {
    // A PascalCase const is a component (an arrow or a forwardRef); anything else is a value.
    if (!/^[A-Z][a-z]/.test(name)) names.add(name);
  }
  for (const [, name] of source.matchAll(/export (?:async )?function (\w+)/g)) {
    if (!/^[A-Z]/.test(name)) names.add(name);
  }
  return names;
}

const files = walk(SRC).filter((path) => /\.tsx?$/.test(path));
const sources = new Map(files.map((path) => [path, readFileSync(path, "utf8")]));
const problems = [];
for (const [path, source] of sources) {
  if (isClient(source)) continue;
  for (const [, clause, spec] of source.matchAll(/import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
    const target = resolveImport(path, spec);
    if (!target || !sources.has(target) || !isClient(sources.get(target))) continue;
    const named = clause.match(/\{([^}]*)\}/)?.[1] ?? "";
    const values = nonComponents(sources.get(target));
    for (const part of named.split(",")) {
      const item = part.trim();
      if (!item || item.startsWith("type ")) continue;
      const name = item.split(/\s+as\s+/)[0].trim();
      if (values.has(name)) problems.push(`src/${relative(SRC, path)}: takes ${name} from the client module ${spec}`);
    }
  }
}

if (problems.length) {
  console.error("Values a server file takes from a \"use client\" module (move them to a shared file):");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`ok: no server file takes a value from a client module (${files.length} files)`);
