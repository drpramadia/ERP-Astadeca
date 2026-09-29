// Verifies the service-role key can reach Supabase Admin API + lists roles.
// Never prints secret values — only status codes and non-sensitive data.
import fs from "node:fs";

const env = {};
for (const ln of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = ln.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

console.log("URL set:", !!URL, "| SERVICE_ROLE set:", !!SVC, "| PUBLISHABLE set:", !!PUB);

function jwtRole(tok) {
  try {
    const p = tok.split(".")[1];
    return JSON.parse(Buffer.from(p, "base64url").toString()).role;
  } catch { return null; }
}
console.log("service key role claim:", jwtRole(SVC || ""));
console.log("publishable prefix ok:", (PUB || "").startsWith("sb_publishable_") || "legacy-jwt");

async function probe(label, url, key) {
  try {
    const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 120); }
    console.log(`${label}: HTTP ${r.status}`);
    return { status: r.status, body };
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
    return { status: 0, body: null };
  }
}

(async () => {
  const users = await probe("admin/users (service)", `${URL}/auth/v1/admin/users?per_page=200`, SVC);
  if (users.status === 200 && users.body && Array.isArray(users.body.users)) {
    console.log("  total auth users:", users.body.users.length);
    console.log("  sample emails:", users.body.users.slice(0, 8).map(u => u.email).join(", "));
    console.log("  email_confirm sample:", users.body.users.slice(0, 3).map(u => u.email_confirmed_at ? "confirmed" : "unconfirmed").join(", "));
  }

  const anonProbe = await probe("admin/users (publishable — should be 401)", `${URL}/auth/v1/admin/users`, PUB);
  console.log("  publishable correctly denied:", anonProbe.status === 401 || anonProbe.status === 403);

  // Roles from the database via REST (service role bypasses RLS)
  try {
    const r = await fetch(`${URL}/rest/v1/roles?select=code,name&order=code`, {
      headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
    });
    const roles = await r.json();
    console.log("roles: HTTP", r.status, "|", Array.isArray(roles) ? roles.map(x => x.code).join(", ") : JSON.stringify(roles).slice(0, 150));
  } catch (e) { console.log("roles error:", e.message); }
})();
