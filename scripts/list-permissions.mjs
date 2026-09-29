// Lists every permission code in the DB and which roles hold it.
import fs from "node:fs";

const env = {};
for (const ln of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = ln.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const get = async (p) => (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, { headers: H })).json();

const perms = await get("permissions?select=code,description&order=code");
const rp = await get("role_permissions?select=role:roles!role_id(code),permission:permissions!permission_id(code)");

const holders = {};
for (const x of rp || []) (holders[x.permission?.code] ||= []).push(x.role?.code);

console.log("=== ALL PERMISSION CODES (" + perms.length + ") ===");
for (const p of perms) {
  console.log(`${p.code.padEnd(28)} ${(holders[p.code] || []).join(",") || "(no role)"}`);
}
