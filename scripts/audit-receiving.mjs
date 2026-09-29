// Goods-in audit. Tests both receiving paths against the live database:
//   A. Rental receiving  -> receive_rental_stock()   (the /rental/receiving form)
//   B. Supply-chain receiving -> create_receiving_from_po()  (no UI calls this)
// Reports whether the backend RPC works, so we can tell a backend gap from a
// UI gap. Created rows are removed at the end.
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

const { data: product } = await supabase.from("products").select("id, name, unit_id").limit(1).maybeSingle();
const { data: unit } = await supabase.from("units").select("id").eq("code", "KG").maybeSingle();
const { data: storage } = await supabase.from("cold_storages").select("id").eq("status", "ACTIVE").limit(1).maybeSingle();
const { data: loc } = await supabase.from("storage_locations")
  .select("id").eq("cold_storage_id", storage?.id).eq("active", true).limit(1).maybeSingle();
const { data: customer } = await supabase.from("customers")
  .select("id").eq("is_rental_customer", true).eq("active", true).limit(1).maybeSingle();
const { data: supplier } = await supabase.from("suppliers").select("id").limit(1).maybeSingle();
const { data: warehouse } = await supabase.from("warehouses").select("id").limit(1).maybeSingle();

console.log(`org=${org}\nproduct=${product?.id}\nunit=${unit?.id}\nstorage=${storage?.id}\nlocation=${loc?.id}`);
console.log(`customer=${customer?.id}\nsupplier=${supplier?.id}\nwarehouse=${warehouse?.id}\n`);

const results = [];
const step = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  -> ${d}` : ""}`); };

// ================= A. RENTAL RECEIVING =================
console.log("=== A. RENTAL RECEIVING (receive_rental_stock) ===");
const { data: contractId, error: cErr } = await supabase.rpc("create_rental_contract", {
  p_organization_id: org, p_customer_id: customer.id, p_cold_storage_id: storage.id,
  p_title: "Audit Barang Masuk", p_start_date: new Date().toISOString().slice(0, 10),
  p_end_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
  p_total_capacity_kg: 1000, p_billing_frequency: "MONTHLY", p_payment_terms_days: 30,
  p_notes: "audit", p_performed_by: uid,
});
let contractUuid = typeof contractId === "string" ? contractId : contractId?.[0]?.result;
if (cErr) { step("create contract", false, cErr.message); }
else {
  const { data: c } = await supabase.from("rental_contracts").select("id").eq("id", contractUuid).maybeSingle();
  contractUuid = c?.id ?? contractUuid;
  step("create contract", !!c, `contract=${contractUuid}`);

  const { data: subId } = await supabase.rpc("submit_rental_contract", { p_contract_id: contractUuid, p_performed_by: uid });
  const { data: appr } = await supabase.from("approval_requests").select("id")
    .eq("entity_type", "RENTAL_CONTRACT").eq("entity_id", contractUuid).maybeSingle();
  await supabase.rpc("decide_approval_request", { p_approval_request_id: appr.id, p_action: "APPROVE", p_comment: "audit", p_actor_user_id: uid });
  await supabase.rpc("activate_rental_contract", { p_contract_id: contractUuid, p_performed_by: uid });

  // batch
  const batchNumber = `AUDIT-${Date.now()}`;
  const { data: batch, error: bErr } = await supabase.from("batches").insert({
    organization_id: org, product_id: product.id, batch_number: batchNumber,
    production_date: null, expiry_date: null,
  }).select("id").single();
  step("create batch", !bErr, bErr?.message ?? `batch=${batch?.id}`);

  const { data: recv, error: rErr } = await supabase.rpc("receive_rental_stock", {
    p_organization_id: org, p_contract_id: contractUuid, p_customer_id: customer.id,
    p_product_id: product.id, p_batch_id: batch?.id, p_cold_storage_id: storage.id,
    p_storage_location_id: loc?.id, p_quantity: 100, p_quantity_kg: 100, p_unit_id: unit.id,
    p_reference_number: `AUDIT-RCV-${Date.now()}`, p_notes: "audit barang masuk", p_performed_by: uid,
  });
  step("receive_rental_stock", !rErr, rErr?.message ?? JSON.stringify(recv));

  const { data: mv } = await supabase.from("rental_stock_movements")
    .select("id, movement_number, movement_type, quantity_kg").eq("contract_id", contractUuid);
  step("rental movement recorded", !!mv?.length, JSON.stringify(mv));

  // cleanup rental
  if (appr) {
    await supabase.from("approval_actions").delete().eq("approval_request_id", appr.id);
    await supabase.from("approval_steps").delete().eq("approval_request_id", appr.id);
    await supabase.from("approval_requests").delete().eq("id", appr.id);
  }
}

// ================= B. SUPPLY-CHAIN RECEIVING =================
console.log("\n=== B. SUPPLY-CHAIN RECEIVING (create_receiving_from_po) ===");
console.log("(note: NO page in src/ calls this RPC)");
const { data: poId, error: poErr } = await supabase.rpc("create_po_draft", {
  p_org_id: org, p_supplier_id: supplier.id,
  p_order_date: new Date().toISOString().slice(0, 10),
  p_expected_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
  p_items: [{ product_id: product.id, quantity: 50, unit_id: unit.id, unit_price: 10000 }],
  p_notes: "audit receiving", p_created_by: uid,
});
let poUuid = poId?.[0]?.result ?? poId;
step("create_po_draft", !poErr, poErr?.message ?? `po=${poUuid}`);

const { data: poRow } = await supabase.from("purchase_orders").select("id").eq("id", poUuid).maybeSingle();
poUuid = poRow?.id ?? poUuid;

if (!poErr) {
  await supabase.rpc("submit_po", { p_po_id: poUuid, p_submitted_by: uid });
  const { data: poAppr } = await supabase.from("approval_requests").select("id")
    .eq("entity_type", "PO").eq("entity_id", poUuid).maybeSingle();
  if (poAppr) {
    await supabase.rpc("decide_approval_request", { p_approval_request_id: poAppr.id, p_action: "APPROVE", p_comment: "audit", p_actor_user_id: uid });
  }

  const { data: items } = await supabase.from("purchase_order_items")
    .select("id, product_id, quantity, unit_id").eq("po_id", poUuid);
  console.log(`   PO items: ${JSON.stringify(items)}`);

  const recvItems = (items ?? []).map((i) => ({
    po_item_id: i.id, product_id: i.product_id, quantity_received: i.quantity, unit_id: i.unit_id,
  }));

  const { data: grn, error: grnErr } = await supabase.rpc("create_receiving_from_po", {
    p_po_id: poUuid,
    p_received_date: new Date().toISOString().slice(0, 10),
    p_items: recvItems,
    p_created_by: uid,
  });
  step("create_receiving_from_po", !grnErr, grnErr?.message ?? JSON.stringify(grn));

  const { data: recs } = await supabase.from("receiving_records")
    .select("id, receiving_number, status").eq("purchase_order_id", poUuid);
  step("receiving_records row created", !!recs?.length, JSON.stringify(recs));

  // cleanup
  if (recs?.length) await supabase.from("receiving_records").delete().eq("purchase_order_id", poUuid);
  if (poAppr) {
    await supabase.from("approval_actions").delete().eq("approval_request_id", poAppr.id);
    await supabase.from("approval_steps").delete().eq("approval_request_id", poAppr.id);
    await supabase.from("approval_requests").delete().eq("id", poAppr.id);
  }
  await supabase.from("purchase_order_items").delete().eq("po_id", poUuid);
  await supabase.from("purchase_orders").delete().eq("id", poUuid);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} passed =====`);
for (const f of failed) console.log(`  FAIL ${f.n}: ${f.d}`);
await supabase.auth.signOut();
