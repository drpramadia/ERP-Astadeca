// Verification harness: logs in as the real user and exercises every RPC + key table
// against the live Supabase project, reporting exactly which operations fail.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

const supabase = createClient(url, key);

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
};

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (authErr) {
  console.error("LOGIN FAILED:", authErr.message);
  process.exit(1);
}
console.log(`Logged in as ${auth.user.email} (${auth.user.id})\n`);

const { data: memberships } = await supabase
  .from("organization_memberships")
  .select("organization_id")
  .eq("user_id", auth.user.id)
  .limit(1);
const orgId = memberships?.[0]?.organization_id;
console.log(`Organization: ${orgId}\n`);

const readRpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  record(`rpc ${name}`, !error, error?.message);
  return data;
};

const pick = async (table, cols = "id") => {
  const { data, error } = await supabase.from(table).select(cols).limit(1);
  if (error) return { err: error.message };
  return { row: data?.[0] };
};

const product = await pick("products");
const customer = await pick("customers");
const supplier = await pick("suppliers");
const coldStorage = await pick("cold_storages");
const warehouse = await pick("warehouses");

console.log("--- Reference rows ---");
console.log("product:", product.row?.id ?? product.err);
console.log("customer:", customer.row?.id ?? customer.err);
console.log("supplier:", supplier.row?.id ?? supplier.err);
console.log("cold_storage:", coldStorage.row?.id ?? coldStorage.err);
console.log("warehouse:", warehouse.row?.id ?? warehouse.err);

console.log("\n--- Read RPCs ---");
await readRpc("get_stock_by_status", { p_organization_id: orgId, p_warehouse_id: null, p_cold_storage_id: null });
await readRpc("get_available_stock_by_product", { p_organization_id: orgId, p_product_id: product.row?.id ?? null });
await readRpc("get_expiring_batches", { p_organization_id: orgId, p_days: 30 });
await readRpc("get_fefo_inventory", { p_organization_id: orgId, p_product_id: product.row?.id ?? null, p_cold_storage_id: null });
await readRpc("get_storage_location_capacity", { p_organization_id: orgId, p_cold_storage_id: coldStorage.row?.id ?? null });
await readRpc("get_document_stats", { p_organization_id: orgId });
await readRpc("has_org_permission", { p_organization_id: orgId, p_permission_code: "inventory.manage" });
await readRpc("is_org_member", { p_organization_id: orgId });
await readRpc("is_super_user", { p_user_id: auth.user.id });

console.log("\n--- Table reads (page loaders) ---");
const tables = [
  "cold_storages", "inventory", "inventory_movements", "approval_requests",
  "purchase_orders", "sales_orders", "delivery_orders", "rental_contracts",
  "rental_invoices", "rental_rates", "notifications", "documents",
  "purchase_requests", "quotations", "receiving_records", "qc_inspections",
  "returns", "stock_opnames", "stock_adjustments", "stock_transfers",
  "products", "customers", "suppliers", "warehouses", "profiles",
  "organization_memberships", "roles", "permissions", "units",
  "product_categories", "storage_locations", "business_units", "audit_logs",
];
for (const t of tables) {
  const { error } = await supabase.from(t).select("id").limit(1);
  record(`select ${t}`, !error, error?.message);
}

console.log("\n--- Notifications ---");
const { data: notifs, error: notifErr } = await supabase
  .from("notifications")
  .select("id, type, title, message, is_read, created_at")
  .eq("recipient_user_id", auth.user.id)
  .limit(10);
record("select notifications (own)", !notifErr && Array.isArray(notifs), notifErr?.message);
console.log(`  -> ${notifs?.length ?? 0} row(s) visible`);

const { error: markErr } = await supabase.rpc("mark_notification_read", { p_all: true });
record("rpc mark_notification_read (p_all)", !markErr, markErr?.message);

console.log("\n--- Realtime ---");
const channel = supabase.channel("verify-notifications");
const subscribeResult = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ ok: false, detail: "timeout waiting for SUBSCRIBED" }), 10000);
  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "notifications" },
    () => {}
  ).subscribe((status) => {
    if (status === "SUBSCRIBED") { clearTimeout(timer); resolve({ ok: true }); }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); resolve({ ok: false, detail: status }); }
  });
});
record("realtime channel subscribe", subscribeResult.ok, subscribeResult.detail);
await supabase.removeChannel(channel);

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} passed =====`);
if (failed.length) {
  console.log("\nFAILURES:");
  for (const f of failed) console.log(`  ${f.name}: ${f.detail}`);
}
await supabase.auth.signOut();
