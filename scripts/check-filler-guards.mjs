// Every page, route and server action must decide what a filler ("vuller") may
// do there before it touches data. A new screen or action that forgets would
// show a filler revenue or let them change things outside the refill work, so
// this check fails the run instead of trusting memory. Run: npm run check:guards
//
// 1. Pages and routes: denyFiller() or requireRefillAccess() as the first thing
//    awaited (awaiting params, searchParams, isFiller() or translations first is fine).
// 2. generateMetadata that loads anything besides translations: the same.
// 3. Server actions: every exported function calls an access check, directly or
//    through a helper in the same file. Public actions are listed below.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("../src", import.meta.url).pathname;
const APP = join(SRC, "app");

// Reachable without an account, or no data at all: nothing to guard. The /dev
// previews run on made-up data and answer "not found" in production.
const PUBLIC_PAGES = [/^login\//, /^signup\//, /^auth\//, /^r\//, /^b\//, /^p\//, /^pwa-icon\//, /^api\/mollie\//, /^dev\//, /^offline\//];
// Server actions that are public on purpose (token links, signup, language, password check).
const PUBLIC_ACTIONS = ["app/r/[token]/actions.ts", "app/p/[token]/actions.ts", "app/signup/actions.ts", "app/password-actions.ts", "i18n/actions.ts"];

const GUARDS = [
  "denyFiller",
  "denyFillerAccess",
  "requireRefillAccess",
  "requireOperator",
  "requireBusinessAccess",
  "requireMachineAccess",
  "requireProductAccess",
  "requireSelectionAccess",
  "requireLayoutAccess",
];
const ALLOWED_BEFORE_GUARD = /^await (params|searchParams|isFiller\(\)|getI18n\(\))/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The body of the function that starts at `start`, by brace matching. */
function bodyAt(source, start) {
  let depth = 0;
  let open = -1;
  for (let i = source.indexOf("(", start), parens = 0; i < source.length; i++) {
    const c = source[i];
    if (open < 0) {
      if (c === "(" || c === "<" || c === "[") parens++;
      else if (c === ")" || c === ">" || c === "]") parens--;
      else if (c === "{" && parens === 0 && source[i + 1] === "\n") {
        open = i;
        depth = 1;
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  return "";
}

/** Is the first await in this body a guard (after the harmless ones)? */
function guardsFirst(body, guards) {
  for (const match of body.matchAll(/await [^;\n]*/g)) {
    const text = match[0];
    if (guards.some((name) => text.startsWith(`await ${name}(`))) return true;
    if (ALLOWED_BEFORE_GUARD.test(text)) continue;
    return false;
  }
  return false;
}

const problems = [];
const files = walk(APP).filter((path) => /\/(page\.tsx|route\.tsx?)$/.test(path));
for (const path of files) {
  const rel = relative(APP, path).replace(/\(app\)\//, "");
  if (PUBLIC_PAGES.some((rule) => rule.test(rel))) continue;
  const source = readFileSync(path, "utf8");
  const main = source.search(/export (default async function|async function (GET|POST))/);
  if (main < 0 || !guardsFirst(bodyAt(source, main), ["denyFiller", "requireRefillAccess"])) {
    problems.push(`src/app/${relative(APP, path)}: no denyFiller() / requireRefillAccess() before loading data`);
  }
  const meta = source.indexOf("export async function generateMetadata");
  if (meta >= 0) {
    const body = bodyAt(source, meta);
    const loads = [...body.matchAll(/await (\w+)\(/g)].some(([, name]) => name !== "getI18n");
    if (loads && !guardsFirst(body, ["denyFiller", "requireRefillAccess"])) {
      problems.push(`src/app/${relative(APP, path)}: generateMetadata loads data before denyFiller()`);
    }
  }
}

const actionFiles = walk(SRC).filter((path) => /\.tsx?$/.test(path) && /^"use server";/m.test(readFileSync(path, "utf8")));
for (const path of actionFiles) {
  const rel = relative(SRC, path);
  if (PUBLIC_ACTIONS.includes(rel)) continue;
  const source = readFileSync(path, "utf8");
  // Local helpers that themselves call a guard count as one.
  const guards = [...GUARDS];
  for (const match of source.matchAll(/(?:^|\n)(?:async )?function (\w+)\(/g)) {
    const body = bodyAt(source, match.index);
    if (GUARDS.some((name) => body.includes(`${name}(`))) guards.push(match[1]);
  }
  for (const match of source.matchAll(/\nexport async function (\w+)\(/g)) {
    const body = bodyAt(source, match.index);
    if (!guards.some((name) => body.includes(`${name}(`))) {
      problems.push(`src/${rel}: action ${match[1]} calls no access check`);
    }
  }
}

if (problems.length) {
  console.error("What a filler may do is not decided here:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`ok: ${files.length} pages and routes, ${actionFiles.length} action files checked`);
