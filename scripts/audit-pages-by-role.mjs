// End-to-end audit: signs in as every role account (real password grant),
// reads its effective permissions, then computes page access against the
// route->permission table parsed out of src/components/app-shell.tsx.
import fs from "node:fs";

const env = {};
for (const ln of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = ln.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const ROLES = ["DIRECTOR", "ADMIN", "WAREHOUSE", "QC", "PURCHASING", "FINANCE", "SALES", "DELIVERY", "SYSTEM"];
const pw = (r) => `Astadeca#${r[0]}${r.slice(1).toLowerCase()}2026!`;

// ── parse route -> permission from the nav definition ────────────────────
const shell = fs.readFileSync("src/components/app-shell.tsx", "utf8");
const nav = [...shell.matchAll(/href:\s*"([^"]+)"[^}]*?permission:\s*"([^"]+)"/g)].map((m) => ({
  href: m[1],
  permission: m[2],
}));
console.log(`Parsed ${nav.length} nav routes from app-shell.tsx`);
if (nav.length === 0) { console.error("No nav routes parsed — check the NAV_GROUPS format."); process.exit(1); }

async function login(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, token: j.access_token, err: j.error_description || j.msg || j.error };
}

async function perms(token) {
  const r = await fetch(`${URL}/rest/v1/rpc/get_my_permissions`, {
    method: "POST",
    headers: { apikey: PUB, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const j = await r.json().catch(() => null);
  if (!Array.isArray(j)) return { status: r.status, list: [] };
  return { status: r.status, list: j.map((x) => (typeof x === "string" ? x : x.code || x.permission_code)) };
}

const results = [];
for (const role of ROLES) {
  const email = `${role.toLowerCase()}.audit@astadeca-audit.com`;
  const lg = await login(email, pw(role));
  if (!lg.ok) {
    console.log(`LOGIN FAIL ${role.padEnd(11)} HTTP ${lg.status} ${lg.err}`);
    results.push({ role, ok: false, err: lg.err });
    continue;
  }
  const p = await perms(lg.token);
  console.log(`LOGIN OK   ${role.padEnd(11)} permissions=${p.list.length}`);
  results.push({ role, ok: true, perms: new Set(p.list) });
}

// ── access matrix ────────────────────────────────────────────────────────
console.log("\n=== PAGE ACCESS MATRIX (✓ = role holds the required permission) ===");
const header = "route".padEnd(34) + "permission".padEnd(26) + ROLES.map((r) => r.slice(0, 3).padEnd(4)).join("");
console.log(header);
console.log("-".repeat(header.length));

const gaps = [];
for (const { href, permission } of nav) {
  let line = href.padEnd(34) + permission.padEnd(26);
  for (const r of results) {
    if (!r.ok) { line += "?? ".padEnd(4); continue; }
    const can = r.perms.has(permission);
    line += (can ? "✓ " : "· ").padEnd(4);
    if (!can) gaps.push(`${r.role}:${href}`);
  }
  console.log(line);
}

// Every route must be reachable by at least one non-SUPER_USER role,
// otherwise the page is dead weight nobody can open.
console.log("\n=== ROUTES NO ROLE CAN REACH (excluding SUPER_USER) ===");
const unreachable = nav.filter((n) => !results.some((r) => r.ok && r.perms.has(n.permission)));
console.log(unreachable.length ? unreachable.map((u) => `  ✗ ${u.href}  (needs ${u.permission})`).join("\n") : "  none");

console.log(`\nlogins ok: ${results.filter((r) => r.ok).length}/${ROLES.length} | permission cells granted: ${nav.length * results.filter(r => r.ok).length - gaps.length}`);
