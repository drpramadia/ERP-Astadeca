// Authenticated route audit against the running dev server.
// Signs in through the Supabase auth REST API, builds the same sb-<ref>-auth-token
// cookie @supabase/ssr writes, then requests every app route with that cookie.
// Reports: HTTP status, whether the middleware let us in, and whether the page
// rendered real content (not an error boundary, not a login redirect).
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const BASE = "http://localhost:3000";

const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }),
});
if (!authRes.ok) { console.error("LOGIN FAILED:", authRes.status, await authRes.text()); process.exit(1); }
const session = await authRes.json();
console.log(`login OK: user=${session.user.id} expires_in=${session.expires_in}s\n`);

// @supabase/ssr stores base64url(JSON) with a "base64-" prefix, split into chunks.
const cookieValue = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const cookieName = `sb-${REF}-auth-token`;
const cookieHeader = `${cookieName}=${cookieValue}`;

// Only routes that exist. Dynamic segments use values the pages accept:
// finance views are receivables|payables|payments.
const routes = [
  "/", "/dashboard", "/approval", "/documents", "/documents/00000000-0000-0000-0000-000000000000",
  "/finance", "/finance/receivables", "/finance/payables", "/finance/payments", "/hutang",
  "/master-data/products", "/master-data/suppliers", "/master-data/customers", "/master-data/units",
  "/rental", "/rental/billing", "/rental/contracts", "/rental/customers", "/rental/inventory",
  "/rental/receiving", "/rental/release",
  "/reports", "/settings", "/settings/roles", "/settings/users",
  "/supply-chain", "/supply-chain/delivery", "/supply-chain/picking", "/supply-chain/purchasing",
  "/supply-chain/qc", "/supply-chain/receiving", "/supply-chain/returns", "/supply-chain/sales",
  "/warehouse", "/warehouse/adjustments", "/warehouse/inventory", "/warehouse/movements",
  "/warehouse/stock-opname", "/warehouse/transfer",
];

// Next inlines the 404 chunk into every route's JS bundle, so matching the text
// "This page could not be found" is a false positive. These markers genuinely
// mean a server failure rendered instead of the page.
const FATAL = [
  "Application error: a server-side exception",
  "An error occurred in the Server Components render",
  "__next_error__",
  "Missing Supabase environment",
];
// App shell markers: present on every authenticated page's sidebar.
const SHELL = ["Persetujuan", "Stok", "Gudang"];

let ok = 0, bad = [];
for (const route of routes) {
  let res, html = "";
  try {
    res = await fetch(BASE + route, { headers: { cookie: cookieHeader }, redirect: "manual" });
    html = await res.text();
  } catch (e) {
    bad.push({ route, status: "NETERR", note: e.message });
    console.log(`${route.padEnd(34)} NETERR  ${e.message}`);
    continue;
  }
  const ctype = res.headers.get("content-type") ?? "";
  const loc = res.headers.get("location") ?? "";
  const fatal = FATAL.find((s) => html.includes(s));
  const hasShell = SHELL.some((s) => html.includes(s));
  const isHtml = ctype.includes("text/html");
  const size = html.length;

  let verdict;
  if (res.status === 307 || res.status === 308) {
    verdict = loc.includes("/login") ? "REDIRECT->login" : "ok redirect";
  } else if (res.status === 404) {
    verdict = "404 not-found";
  } else if (res.status >= 400) {
    verdict = `HTTP ${res.status}`;
  } else if (!isHtml) {
    verdict = `non-html (${ctype})`;
  } else if (fatal) {
    verdict = `SERVER ERROR (${fatal})`;
  } else if (!hasShell) {
    verdict = "NO APP SHELL";
  } else {
    verdict = "ok";
  }

  if (verdict === "ok" || verdict === "ok redirect") ok++;
  else bad.push({ route, status: res.status, note: verdict });

  console.log(`${route.padEnd(34)} ${String(res.status).padEnd(5)} ${String(size).padEnd(8)} ${verdict}`);
}

console.log(`\n===== ${ok}/${routes.length} routes healthy =====`);
if (bad.length) {
  console.log("\nISSUES:");
  for (const b of bad) console.log(`  ${b.route}  [${b.status}]  ${b.note}`);
}
