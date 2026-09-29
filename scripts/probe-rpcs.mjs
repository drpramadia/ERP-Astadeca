// Fetches the PostgREST OpenAPI spec: real RPC names + parameter signatures,
// then diffs them against every rpc("<name>") call in src/.
import fs from "node:fs";
import path from "node:path";

const env = {};
for (const ln of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = ln.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;

const r = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
const spec = await r.json();
const paths = Object.keys(spec.paths || {});
const rpcPaths = paths.filter((p) => p.startsWith("/rpc/"));

const db = {};
for (const p of rpcPaths) {
  const name = p.slice(5);
  const post = spec.paths[p].post || {};
  const params = (post.parameters || [])
    .filter((x) => x.in === "body" && x.schema)
    .map((x) => Object.keys(x.schema.properties || {}))
    .flat();
  const args = post.requestBody?.content?.["application/json"]?.schema?.properties || {};
  db[name] = Object.keys(args).length ? Object.keys(args) : params;
}
console.log("DB has", Object.keys(db).length, "RPCs\n");

// Walk src/ for rpc("...") calls
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk("src");
const used = new Map();
for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  const re = /\.rpc\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g;
  let m;
  while ((m = re.exec(txt))) {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(f.replace(/\\/g, "/"));
  }
}
console.log("Frontend calls", used.size, "distinct RPCs\n");

const missing = [];
const present = [];
for (const [name, where] of [...used].sort()) {
  if (db[name]) present.push({ name, args: db[name], where });
  else missing.push({ name, where });
}

console.log("=== RPCs CALLED BUT ABSENT FROM DB (" + missing.length + ") ===");
for (const m of missing) console.log("  ✗ " + m.name.padEnd(34) + m.where.slice(0, 4).join(", "));

console.log("\n=== RPCs PRESENT IN DB (called by frontend) ===");
for (const p of present) console.log("  ✓ " + p.name.padEnd(34) + "(" + p.args.join(", ") + ")");

const orphan = Object.keys(db).filter((k) => !used.has(k)).sort();
console.log("\n=== DB RPCs NOT CALLED BY FRONTEND (" + orphan.length + ") ===");
console.log("  " + orphan.join(", "));
