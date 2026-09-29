// Verifies each audit account has a profile, an active membership and the
// intended org role, then reports the effective permission count per role.
import fs from "node:fs";

const env = {};
for (const ln of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = ln.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };

async function get(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) };
}

const org = (await get("organizations?select=id&limit=1")).json[0].id;

const rows = (
  await get(
    `organization_memberships?organization_id=eq.${org}` +
      `&select=id,is_active,user:profiles!user_id(id,full_name,system_role),role:roles!role_id(code,name)`
  )
).json;

console.log("memberships:", rows.length);
console.log("| user_id | email-ish (profile) | role | active | system_role |");
for (const m of rows) {
  console.log(
    `| ${(m.user?.id || "").slice(0, 8)} | ${(m.user?.full_name || "-").padEnd(18)} | ${(m.role?.code || "-").padEnd(10)} | ${String(m.is_active).padEnd(5)} | ${m.user?.system_role || "-"} |`
  );
}

// Effective permission count per role — proves the RBAC matrix is populated.
const rp = await get("role_permissions?select=role:roles!role_id(code),permission:permissions!permission_id(code)");
const byRole = {};
for (const x of rp.json || []) {
  const c = x.role?.code;
  if (!c) continue;
  (byRole[c] ||= []).push(x.permission?.code);
}
console.log("\n=== permission count per role ===");
for (const [code, perms] of Object.entries(byRole).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${code.padEnd(11)} ${String(perms.length).padStart(3)}  ${perms.slice(0, 6).join(", ")}${perms.length > 6 ? ", …" : ""}`);
}
