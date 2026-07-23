import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve knowledge pack for npm install, monorepo, or binary release layout.
 * Order: SIXEARS_KNOWLEDGE / 6EARS_KNOWLEDGE → next to executable → ../knowledge from module.
 */
export function knowledgeRoot() {
  const candidates = [];
  if (process.env.SIXEARS_KNOWLEDGE) candidates.push(process.env.SIXEARS_KNOWLEDGE);
  if (process.env["6EARS_KNOWLEDGE"]) candidates.push(process.env["6EARS_KNOWLEDGE"]);

  // Bun --compile: executable directory often has sibling knowledge/
  try {
    const execPath = process.execPath;
    if (execPath && !execPath.includes("node") && !execPath.includes("bun")) {
      candidates.push(path.join(path.dirname(execPath), "knowledge"));
    }
  } catch {
    /* ignore */
  }
  if (process.argv[1]) {
    candidates.push(path.join(path.dirname(path.resolve(process.argv[1])), "knowledge"));
    candidates.push(path.join(path.dirname(path.resolve(process.argv[1])), "..", "knowledge"));
  }
  candidates.push(path.resolve(__dirname, "../knowledge"));
  candidates.push(path.resolve(process.cwd(), "knowledge"));

  for (const c of candidates) {
    const abs = path.resolve(c);
    if (fs.existsSync(path.join(abs, "PLAYBOOK.md"))) return abs;
  }
  // Fall back to package-relative even if missing (doctor will report)
  return path.resolve(__dirname, "../knowledge");
}

function walkMd(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkMd(full, acc);
    else if (name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

function score(text, terms) {
  const lower = text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (!t) continue;
    let idx = 0;
    while ((idx = lower.indexOf(t, idx)) !== -1) {
      s += 1;
      idx += t.length;
    }
  }
  return s;
}

/**
 * Simple term search over the shipped knowledge pack (no network).
 */
export function searchKnowledge(query, { limit = 8 } = {}) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
  if (!terms.length) return [];

  const root = knowledgeRoot();
  const files = walkMd(root);
  const hits = [];

  for (const file of files) {
    const body = fs.readFileSync(file, "utf8");
    const sc = score(body, terms) + score(path.basename(file), terms) * 3;
    if (sc <= 0) continue;
    const lines = body.split("\n");
    let snippet = "";
    for (const line of lines) {
      const l = line.toLowerCase();
      if (terms.some((t) => l.includes(t))) {
        snippet = line.trim().slice(0, 200);
        break;
      }
    }
    if (!snippet) snippet = lines.find((l) => l.trim())?.trim().slice(0, 200) || "";
    hits.push({
      score: sc,
      path: path.relative(root, file),
      snippet,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

export function readKnowledgeFile(rel) {
  const full = path.join(knowledgeRoot(), rel);
  if (!full.startsWith(knowledgeRoot())) throw new Error("Invalid path");
  if (!fs.existsSync(full)) throw new Error(`Not found: ${rel}`);
  return fs.readFileSync(full, "utf8");
}
