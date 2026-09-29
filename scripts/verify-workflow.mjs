// End-to-end workflow test against the live project, using the real login.
// Exercises the actual business RPCs the UI buttons call, in sequence:
//   create_po_draft -> submit_po -> decide_approval_request
// and the equivalent rental chain. Every step is reported, and created rows are
// cleaned up afterwards.
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: process.env.TEST_EMAIL,
  password: process.env.TEST_PASSWORD,
});
if (authErr) { console.error("LOGIN FAILED:", authErr.message); process.exit(1); }
const userId = auth.user.id;

const { data: mem } = await supabase
  .from("organization_memberships")
  .select("organization_id")
  .eq("user_id", userId)
  .eq("is_active", true)
  .maybeSingle();
const orgId = mem.organization_id;

const { data: supplier } = await supabase.from("suppliers").select("id").limit(1).maybeSingle();
const { data: customer } = await supabase
  .from("customers")
  .select("id")
  .eq("is_rental_customer", true)
  .eq("active", true)
  .limit(1)
  .maybeSingle();
const { data: product } = await supabase.from("products").select("id").limit(1).maybeSingle();
const { data: coldStorage } = await supabase.from("cold_storages").select("id").limit(1).maybeSingle();
const { data: unit } = await supabase.from("units").select("id").eq("code", "KG").limit(1).maybeSingle();

console.log(`user=${userId}\norg=${orgId}`);
console.log(`supplier=${supplier?.id}\ncustomer=${customer?.id}\nproduct=${product?.id}`);
console.log(`cold_storage=${coldStorage?.id}\nunit=${unit?.id}\n`);

const results = [];
const step = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
};

// ============ PO CHAIN ============
console.log("=== PURCHASE ORDER CHAIN ===");
const { data: poId, error: poErr } = await supabase.rpc("create_po_draft", {
  p_org_id: orgId,
  p_supplier_id: supplier.id,
  p_order_date: new Date().toISOString().slice(0, 10),
  p_expected_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
  p_items: [{ product_id: product.id, quantity: 100, unit_id: unit.id, unit_price: 50000 }],
  p_notes: "E2E workflow test",
  p_created_by: userId,
});
step("create_po_draft", !poErr, poErr?.message ?? `po_id=${JSON.stringify(poId)}`);
if (poErr) { console.log("\nStopping: PO draft failed."); await supabase.auth.signOut(); process.exit(1); }

const createdPoId = Array.isArray(poId) ? poId[0]?.result : (poId && typeof poId === "object" ? (poId.id ?? poId.result) : poId);
const { data: poRow } = await supabase.from("purchase_orders").select("id, status, po_number").eq("id", createdPoId).maybeSingle();
console.log(`   PO row: ${JSON.stringify(poRow)}`);

const { data: submitRes, error: submitErr } = await supabase.rpc("submit_po", {
  p_po_id: createdPoId,
  p_submitted_by: userId,
});
step("submit_po", !submitErr, submitErr?.message ?? JSON.stringify(submitRes));

const poAfterSubmit = await supabase.from("purchase_orders").select("status").eq("id", createdPoId).maybeSingle();
console.log(`   status after submit: ${poAfterSubmit.data?.status}`);

const { data: appr } = await supabase
  .from("approval_requests")
  .select("id, entity_type, entity_id, status, title")
  .eq("entity_type", "PO")
  .eq("entity_id", createdPoId)
  .maybeSingle();
console.log(`   approval request: ${JSON.stringify(appr)}`);

if (appr) {
  const { data: decided, error: decErr } = await supabase.rpc("decide_approval_request", {
    p_approval_request_id: appr.id,
    p_action: "APPROVE",
    p_comment: "E2E auto-approve",
    p_actor_user_id: userId,
  });
  step("decide_approval_request (APPROVE)", !decErr, decErr?.message ?? JSON.stringify(decided));

  const poFinal = await supabase.from("purchase_orders").select("status, approved_by, approved_at").eq("id", createdPoId).maybeSingle();
  step("PO status propagated", poFinal.data?.status === "APPROVED", `status=${poFinal.data?.status}`);
}

// cleanup
await supabase.from("approval_steps").delete().eq("approval_request_id", appr?.id ?? "00000000-0000-0000-0000-000000000000");
await supabase.from("approval_actions").delete().eq("approval_request_id", appr?.id ?? "00000000-0000-0000-0000-000000000000");
await supabase.from("approval_requests").delete().eq("id", appr?.id ?? "00000000-0000-0000-0000-000000000000");
await supabase.from("purchase_order_items").delete().eq("po_id", createdPoId);
await supabase.from("purchase_orders").delete().eq("id", createdPoId);

// ============ RENTAL CHAIN ============
console.log("\n=== RENTAL CONTRACT CHAIN ===");
const { data: contractId, error: rcErr } = await supabase.rpc("create_rental_contract", {
  p_organization_id: orgId,
  p_customer_id: customer.id,
  p_cold_storage_id: coldStorage.id,
  p_title: "E2E Rental Contract",
  p_start_date: new Date().toISOString().slice(0, 10),
  p_end_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
  p_total_capacity_kg: 1000,
  p_billing_frequency: "MONTHLY",
  p_payment_terms_days: 30,
  p_notes: "E2E test",
  p_performed_by: userId,
});
step("create_rental_contract", !rcErr, rcErr?.message ?? JSON.stringify(contractId));

let contractUuid = null;
if (!rcErr) {
  const { data: cRow } = await supabase
    .from("rental_contracts")
    .select("id, status, contract_number")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  contractUuid = cRow?.id;
  console.log(`   contract: ${JSON.stringify(cRow)}`);

  const { data: subRes, error: subErr } = await supabase.rpc("submit_rental_contract", {
    p_contract_id: contractUuid,
    p_performed_by: userId,
  });
  step("submit_rental_contract", !subErr, subErr?.message ?? JSON.stringify(subRes));

  const { data: rcAppr } = await supabase
    .from("approval_requests")
    .select("id, status, entity_type")
    .eq("entity_type", "RENTAL_CONTRACT")
    .eq("entity_id", contractUuid)
    .maybeSingle();
  console.log(`   approval request: ${JSON.stringify(rcAppr)}`);

  if (rcAppr) {
    const { data: rcDecided, error: rcDecErr } = await supabase.rpc("decide_approval_request", {
      p_approval_request_id: rcAppr.id,
      p_action: "APPROVE",
      p_comment: "E2E approve rental",
      p_actor_user_id: userId,
    });
    step("decide_approval_request rental (APPROVE)", !rcDecErr, rcDecErr?.message ?? JSON.stringify(rcDecided));

    const { data: actRes, error: actErr } = await supabase.rpc("activate_rental_contract", {
      p_contract_id: contractUuid,
      p_performed_by: userId,
    });
    step("activate_rental_contract", !actErr, actErr?.message ?? JSON.stringify(actRes));

    const cFinal = await supabase.from("rental_contracts").select("status").eq("id", contractUuid).maybeSingle();
    step("rental_contract ACTIVE", cFinal.data?.status === "ACTIVE", `status=${cFinal.data?.status}`);

    await supabase.from("approval_steps").delete().eq("approval_request_id", rcAppr.id);
    await supabase.from("approval_actions").delete().eq("approval_request_id", rcAppr.id);
    await supabase.from("approval_requests").delete().eq("id", rcAppr.id);
  }
  if (contractUuid) await supabase.from("rental_contracts").delete().eq("id", contractUuid);
}

// ============ SUMMARY ============
const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} passed =====`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(`  ${f.name}: ${f.detail}`);
}
await supabase.auth.signOut();
