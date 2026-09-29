// Audits the schema objects adminCreateUser / adminToggleMembership touch.
// Read-only: GET probes + RPC existence checks. No writes, no secrets printed.
import fs from "node:fs";

const env = {};
for (const ln of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = ln.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };

async function table(name, query = "select=*&limit=1") {
  const r = await fetch(`${URL}/rest/v1/${name}?${query}`, { headers: H });
  const t = await r.text();
  let ok = r.status === 200;
  let cols = [];
  if (ok) {
    try { const rows = JSON.parse(t); if (rows[0]) cols = Object.keys(rows[0]); } catch {}
  }
  console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(28)} HTTP ${r.status}${ok ? "  cols: " + (cols.join(",") || "(empty table)") : "  " + t.slice(0, 140)}`);
  return { ok, cols };
}

console.log("=== TABLES ===");
await table("profiles");
await table("organization_memberships");
await table("roles");
await table("organizations");
await table("system_audit_log");
await table("notifications");

console.log("\n=== RPC (POST with empty args → expect 404 if missing, 400 if arg mismatch) ===");
for (const fn of ["toggle_membership", "update_user_role", "decide_approval_request"]) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}",
  });
  const t = await r.text();
  const verdict = r.status === 404 ? "MISSING" : r.status === 400 ? "EXISTS (args differ)" : `HTTP ${r.status}`;
  console.log(`${fn.padEnd(26)} ${verdict}  ${t.slice(0, 160)}`);
}

console.log("\n=== profiles of existing users ===");
try {
  const r = await fetch(`${URL}/rest/v1/profiles?select=id,full_name,system_role`, { headers: H });
  console.log("HTTP", r.status, (await r.text()).slice(0, 300));
} catch (e) { console.log("e", e.message); }
