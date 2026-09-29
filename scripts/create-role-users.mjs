// Creates one audit account per org role (idempotent).
//
// Uses the service-role key to (a) create the auth user, (b) upsert the profile,
// (c) create the org membership. Rerunning is safe: existing emails are reused
// and only the membership is (re)ensured.
//
// Usage: node scripts/create-role-users.mjs
import fs from "node:fs";
import crypto from "node:crypto";

const env = {};
for (const ln of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = ln.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

// Roles to provision. SYSTEM is included: it owns system-level notifications.
const ROLES = [
  "DIRECTOR",
  "ADMIN",
  "WAREHOUSE",
  "QC",
  "PURCHASING",
  "LOGISTIC",
  "FINANCE",
  "SALES",
  "DELIVERY",
  "SYSTEM",
];

// Deterministic, strong passwords so they can actually be typed at login.
function passwordFor(role) {
  const base = `Astadeca#${role[0]}${role.slice(1).toLowerCase()}2026!`;
  return base.length >= 12 ? base : base + crypto.randomBytes(3).toString("hex");
}
function emailFor(role) {
  return `${role.toLowerCase()}.audit@astadeca-audit.com`;
}

async function req(method, path, body) {
  const r = await fetch(`${URL}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: r.ok, status: r.status, json };
}

// ── org + roles ──────────────────────────────────────────────────────────
const orgRes = await req("GET", "/rest/v1/organizations?select=id,name&limit=1");
const org = orgRes.json?.[0];
if (!org) { console.error("No organization found — aborting."); process.exit(1); }
console.log("Organization:", org.name, org.id);

const rolesRes = await req("GET", "/rest/v1/roles?select=id,code,name");
const roleByCode = Object.fromEntries((rolesRes.json || []).map((r) => [r.code, r]));
console.log("Roles in DB:", Object.keys(roleByCode).join(", "));

// ── existing auth users ──────────────────────────────────────────────────
const usersRes = await req("GET", "/auth/v1/admin/users?per_page=1000");
const existing = new Map((usersRes.json?.users || []).map((u) => [u.email, u.id]));
console.log("Existing auth users:", existing.size);

const created = [];
const skipped = [];

for (const role of ROLES) {
  const email = emailFor(role);
  const password = passwordFor(role);
  const roleRow = roleByCode[role];

  if (!roleRow) {
    console.log(`SKIP ${role.padEnd(11)} — no such role in DB`);
    continue;
  }

  let userId = existing.get(email);

  if (!userId) {
    const created = await req("POST", "/auth/v1/admin/users", {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Audit ${role}` },
    });
    if (!created.ok) {
      console.log(`FAIL ${role.padEnd(11)} auth: ${created.status} ${JSON.stringify(created.json).slice(0, 160)}`);
      continue;
    }
    userId = created.json.id;
    console.log(`NEW  ${role.padEnd(11)} ${email}`);
  } else {
    // Ensure the known password works on reruns.
    await req("PUT", `/auth/v1/admin/users/${userId}`, { password, email_confirm: true });
    console.log(`EXIST ${role.padEnd(10)} ${email}`);
  }

  // Profile (service role bypasses the missing INSERT policy)
  const p = await req("POST", "/rest/v1/profiles", { id: userId, full_name: `Audit ${role}` },
    { Prefer: "resolution=merge-duplicates" });
  if (!p.ok) console.log(`  profile FAIL ${p.status} ${JSON.stringify(p.json).slice(0, 120)}`);

  // Membership — replace any existing row for this user+org
  const del = await req("DELETE", `/rest/v1/organization_memberships?user_id=eq.${userId}&organization_id=eq.${org.id}`);
  if (!del.ok) console.log(`  membership delete FAIL ${del.status}`);
  const ins = await req("POST", "/rest/v1/organization_memberships", {
    user_id: userId,
    organization_id: org.id,
    role_id: roleRow.id,
    is_active: true,
  });
  if (!ins.ok) console.log(`  membership FAIL ${ins.status} ${JSON.stringify(ins.json).slice(0, 140)}`);

  (existing.has(email) ? skipped : created).push({ role, email, password, userId });
}

console.log("\n=== CREDENTIALS ===");
for (const r of [...created, ...skipped]) {
  console.log(`${r.role.padEnd(11)} ${r.email.padEnd(38)} ${r.password}`);
}
console.log(`\ncreated: ${created.length}, reused: ${skipped.length}`);
