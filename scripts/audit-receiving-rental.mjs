// Corrected goods-in test for the rental path, mirroring exactly what the
// /rental/receiving form does:
//   1. contract -> submit -> approve -> activate
//   2. insert batch WITH received_date (the column is NOT NULL, no default)
//   3. receive_rental_stock with a real p_batch_id
// Also cleans up leftovers from the earlier run.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD,
});
if (authErr) { console.error("LOGIN FAILED:", authErr.message); process.exit(1); }
const uid = auth.user.id;

const { data: mem } = await supabase.from("organization_memberships")
  .select("organization_id").eq("user_id", uid).eq("is_active", true).maybeSingle();
const org = mem.organization_id;

const results = [];
const step = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  -> ${d}` : ""}`); };

const { data: product } = await supabase.from("products").select("id, unit_id").limit(1).maybeSingle();
const { data: unit } = await supabase.from("units").select("id").eq("code", "KG").maybeSingle();
const { data: storage } = await supabase.from("cold_storages").select("id").eq("status", "ACTIVE").limit(1).maybeSingle();
const { data: loc } = await supabase.from("storage_locations")
  .select("id").eq("cold_storage_id", storage.id).eq("active", true).limit(1).maybeSingle();
const { data: customer } = await supabase.from("customers")
  .select("id").eq("is_rental_customer", true).eq("active", true).limit(1).maybeSingle();

console.log("=== RENTAL RECEIVING (form flow) ===");

// 1. contract + approval
const { data: cid, error: cErr } = await supabase.rpc("create_rental_contract", {
  p_organization_id: org, p_customer_id: customer.id, p_cold_storage_id: storage.id,
  p_title: "Audit Barang Masuk", p_start_date: new Date().toISOString().slice(0, 10),
  p_end_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
  p_total_capacity_kg: 1000, p_billing_frequency: "MONTHLY", p_payment_terms_days: 30,
  p_notes: "audit", p_performed_by: uid,
});
if (cErr) { step("create contract", false, cErr.message); }
const { data: cRow } = await supabase.from("rental_contracts").select("id, status")
  .eq("created_by", uid).order("created_at", { ascending: false }).limit(1).maybeSingle();
const contractUuid = cRow?.id;
step("create contract", !!contractUuid, `contract=${contractUuid} status=${cRow?.status}`);

await supabase.rpc("submit_rental_contract", { p_contract_id: contractUuid, p_performed_by: uid });
const { data: appr } = await supabase.from("approval_requests").select("id")
  .eq("entity_type", "RENTAL_CONTRACT").eq("entity_id", contractUuid).maybeSingle();
if (appr) await supabase.rpc("decide_approval_request", { p_approval_request_id: appr.id, p_action: "APPROVE", p_comment: "audit", p_actor_user_id: uid });
const { data: actRes, error: actErr } = await supabase.rpc("activate_rental_contract", { p_contract_id: contractUuid, p_performed_by: uid });
step("activate contract", !actErr, actErr?.message ?? String(actRes));

// 2. batch exactly as the form inserts it
const batchNumber = `AUDIT-${Date.now()}`;
const { data: newBatch, error: bErr } = await supabase.from("batches").insert({
  organization_id: org,
  product_id: product.id,
  batch_number: batchNumber,
  received_date: new Date().toISOString().slice(0, 10),
  production_date: null,
  expiry_date: null,
}).select("id").single();
step("create batch (form insert)", !bErr, bErr?.message ?? `batch=${newBatch?.id}`);

// 3. receive_rental_stock exactly as the form calls it (note arg ORDER irrelevant, names matter)
const { data: recv, error: rErr } = await supabase.rpc("receive_rental_stock", {
  p_organization_id: org,
  p_contract_id: contractUuid,
  p_customer_id: customer.id,
  p_product_id: product.id,
  p_batch_id: newBatch?.id,
  p_cold_storage_id: storage.id,
  p_storage_location_id: loc?.id,
  p_quantity: 100,
  p_quantity_kg: 100,
  p_unit_id: unit.id,
  p_reference_number: `AUDIT-RCV-${Date.now()}`,
  p_notes: "audit barang masuk",
  p_performed_by: uid,
});
step("receive_rental_stock", !rErr, rErr?.message ?? JSON.stringify(recv));

const { data: mv } = await supabase.from("rental_stock_movements")
  .select("id, movement_number, movement_type, quantity_kg").eq("contract_id", contractUuid);
step("rental movement recorded", !!mv?.length, JSON.stringify(mv));

// does the goods show up as customer-owned inventory?
const { data: inv } = await supabase.from("inventory")
  .select("id, quantity, quantity_kg, owner_type, owner_id")
  .eq("owner_type", "CUSTOMER").eq("owner_id", customer.id).limit(5);
step("customer-owned inventory present", !!inv?.length, JSON.stringify(inv?.slice(0, 2)));

console.log(`\n===== ${results.filter(r => r.ok).length}/${results.length} passed =====`);
for (const f of results.filter(r => !r.ok)) console.log(`  FAIL ${f.n}: ${f.d}`);

// ---- cleanup ----
console.log("\n--- cleanup ---");
if (appr) {
  await supabase.from("approval_actions").delete().eq("approval_request_id", appr.id);
  await supabase.from("approval_steps").delete().eq("approval_request_id", appr.id);
  await supabase.from("rental_contracts").update({ approval_request_id: null }).eq("id", contractUuid);
  await supabase.from("approval_requests").delete().eq("id", appr.id);
}
const { error: delC } = await supabase.from("rental_contracts").delete().eq("id", contractUuid);
console.log("delete contract:", delC?.message ?? "ok");
await supabase.auth.signOut();
