"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractOption {
  id: string;
  contract_number: string;
  title: string;
  customer_id: string;
  customer_name?: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku?: string;
  code?: string;
}

interface ItemRow {
  id: number;
  productId: string;
  batchNumber: string;
  qtyKg: string;
  productionDate: string;
  expiryDate: string;
  binLocation: string;
}

interface QCCheckItem {
  id: string;
  checklist_item: string;
  description: string | null;
  is_required: boolean;
  check_type: string;
  sort_order: number;
}

interface QCResult {
  [templateId: string]: {
    pass: boolean | null;
    value: string;
    photoUrl: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newRow(id: number): ItemRow {
  return {
    id,
    productId: "",
    batchNumber: "",
    qtyKg: "",
    productionDate: "",
    expiryDate: "",
    binLocation: "",
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RentalReceivingPage() {
  const supabase = createClient();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);

  // Step 1
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Step 2 — dynamic item lines
  const [lines, setLines] = useState<ItemRow[]>([newRow(1)]);
  const [nextId, setNextId] = useState(2);

  // Products
  const [products, setProducts] = useState<ProductOption[]>([]);

  // QC Checklist
  const [qcItems, setQcItems] = useState<QCCheckItem[]>([]);
  const [qcResults, setQcResults] = useState<QCResult>({});
  const [showQc, setShowQc] = useState(false);

  // UI
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ─── Load contracts + products ───────────────────────────────────────────────
  const load = useCallback(async (orgId: string, userId: string) => {
    const [{ data: contractData, error: contractErr }, { data: productData, error: productErr }] =
      await Promise.all([
        supabase
          .from("rental_contracts")
          .select("id, contract_number, title, customer_id, rental_contracts_customer_fkey(name)")
          .eq("organization_id", orgId)
          .eq("status", "ACTIVE")
          .order("contract_number"),
        supabase
          .from("products")
          .select("id, name, sku, code")
          .eq("organization_id", orgId)
          .eq("active", true)
          .order("name"),
      ]);

    if (contractErr) throw contractErr;
    if (productErr) throw productErr;

    setOrganizationId(orgId);
    setActorId(userId);
    setContracts(
      (contractData ?? []).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        contract_number: c.contract_number as string,
        title: c.title as string,
        customer_id: c.customer_id as string,
        customer_name: ((c.rental_contracts_customer_fkey as Record<string, unknown>)?.name as string) ?? "",
      }))
    );
    setProducts(
      (productData ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: p.name as string,
        sku: p.sku as string | undefined,
        code: p.code as string | undefined,
      }))
    );
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { data: claimsData } = await supabase.auth.getClaims();
        const userId = (claimsData?.claims as { sub?: string })?.sub;
        if (!userId) throw new Error("Silakan login untuk mengakses halaman ini.");
        const { data: membership, error: membershipErr } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();
        if (membershipErr) throw membershipErr;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        await load(membership.organization_id, userId);

        // Load QC checklist templates
        const { data: qcData } = await supabase
          .from("qc_cs_checklist_templates")
          .select("*")
          .eq("organization_id", membership.organization_id)
          .eq("active", true)
          .order("sort_order");
        if (!cancelled) setQcItems((qcData ?? []) as QCCheckItem[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat data.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void init();
    return () => { cancelled = true; };
  }, [load, supabase]);

  // ─── Line helpers ────────────────────────────────────────────────────────────
  function updateLine(id: number, field: keyof ItemRow, value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newRow(nextId)]);
    setNextId((n) => n + 1);
  }

  function removeLine(id: number) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId || !actorId || !selectedContractId) return;

    const filledLines = lines.filter((l) => l.productId || l.batchNumber || l.qtyKg);
    if (filledLines.length === 0) {
      setError("Tambahkan minimal satu item sebelum menyimpan.");
      return;
    }
    const invalid = filledLines.some(
      (l) => !l.productId || !l.batchNumber.trim() || !l.qtyKg.trim()
    );
    if (invalid) {
      setError("Setiap baris wajib memiliki produk, nomor batch, dan jumlah (kg).");
      return;
    }
    const qtyValues = filledLines.map((l) => Number(l.qtyKg));
    if (qtyValues.some((v) => !Number.isFinite(v) || v <= 0)) {
      setError("Jumlah (kg) harus berupa angka positif.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Check whether dedicated tables exist
      const { data: tableCheck } = await supabase
        .from("rental_goods_receipts")
        .select("id")
        .limit(1)
        .maybeSingle();

      const contract = contracts.find((c) => c.id === selectedContractId);
      const refBase = `RGR-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;

      if (tableCheck !== null) {
        // ── Dedicated schema: rental_goods_receipts + rental_goods_receipt_items ──
        const { data: receipt, error: receiptErr } = await supabase
          .from("rental_goods_receipts")
          .insert({
            contract_id: selectedContractId,
            notes: notes || null,
            received_by: actorId,
            received_at: new Date().toISOString(),
            status: "RECEIVED",
            reference_number: refBase,
          })
          .select("id")
          .single();
        if (receiptErr) throw receiptErr;

        const receiptId = receipt.id;

        const items = await Promise.all(
          filledLines.map(async (line) => {
            const { data: batchData } = await supabase
              .from("batches")
              .select("id")
              .eq("organization_id", organizationId)
              .eq("product_id", line.productId)
              .eq("batch_number", line.batchNumber.trim())
              .maybeSingle();

            let batchId: string;
            if (batchData) {
              batchId = batchData.id;
            } else {
              const { data: newBatch, error: batchErr } = await supabase
                .from("batches")
                .insert({
                  organization_id: organizationId,
                  product_id: line.productId,
                  batch_number: line.batchNumber.trim(),
                  production_date: line.productionDate || null,
                  expiry_date: line.expiryDate || null,
                })
                .select("id")
                .single();
              if (batchErr) throw batchErr;
              batchId = newBatch.id;
            }

            return {
              receipt_id: receiptId,
              product_id: line.productId,
              batch_id: batchId,
              batch_number: line.batchNumber.trim(),
              qty_kg: Number(line.qtyKg),
              production_date: line.productionDate || null,
              expiry_date: line.expiryDate || null,
              bin_location: line.binLocation.trim() || null,
            };
          })
        );

        const { error: itemsErr } = await supabase
          .from("rental_goods_receipt_items")
          .insert(items);
        if (itemsErr) throw itemsErr;
      } else {
        // ── Fallback: write into rental_stock_movements ─────────────────────
        await Promise.all(
          filledLines.map(async (line) => {
            const { data: batchData } = await supabase
              .from("batches")
              .select("id")
              .eq("organization_id", organizationId)
              .eq("product_id", line.productId)
              .eq("batch_number", line.batchNumber.trim())
              .maybeSingle();

            let batchId: string;
            if (batchData) {
              batchId = batchData.id;
            } else {
              const { data: newBatch, error: batchErr } = await supabase
                .from("batches")
                .insert({
                  organization_id: organizationId,
                  product_id: line.productId,
                  batch_number: line.batchNumber.trim(),
                  production_date: line.productionDate || null,
                  expiry_date: line.expiryDate || null,
                })
                .select("id")
                .single();
              if (batchErr) throw batchErr;
              batchId = newBatch.id;
            }

            const { error: movErr } = await supabase.from("rental_stock_movements").insert({
              organization_id: organizationId,
              contract_id: selectedContractId,
              customer_id: contract?.customer_id ?? "",
              product_id: line.productId,
              batch_id: batchId,
              cold_storage_location_id: null,
              movement_type: "RECEIVE",
              movement_subtype: "RENTAL_GOODS_RECEIPT",
              quantity_kg: Number(line.qtyKg),
              quantity_unit: null,
              reference_number: `${refBase}-${line.batchNumber.trim()}`,
              notes: notes || null,
              performed_by: actorId,
              performed_at: new Date().toISOString(),
              metadata: JSON.stringify({
                bin_location: line.binLocation.trim() || null,
                production_date: line.productionDate || null,
                expiry_date: line.expiryDate || null,
              }),
            });
            if (movErr) throw movErr;
          })
        );
      }

      const totalKg = filledLines.reduce((sum, l) => sum + Number(l.qtyKg), 0);
      setSuccess(
        `${filledLines.length} baris item berhasil disimpan — total ${totalKg.toLocaleString("id-ID")} kg.`
      );
      setLines([newRow(1)]);
      setNextId(2);
      setNotes("");
      setSelectedContractId("");
    } catch (err) {
      setError((err as Error).message ?? "Gagal menyimpan data penerimaan.");
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Derived ────────────────────────────────────────────────────────────────
  const selectedContract = contracts.find((c) => c.id === selectedContractId);
  const filledLines = lines.filter((l) => l.productId || l.batchNumber || l.qtyKg);
  const itemsTotalKg = filledLines.reduce((sum, l) => sum + (Number(l.qtyKg) || 0), 0);

  const contractOptions = contracts.map((c) => ({
    value: c.id,
    label: `${c.contract_number} — ${c.title}${c.customer_name ? ` (${c.customer_name})` : ""}`,
  }));

  const productOptions = products.map((p) => ({
    value: p.id,
    label: p.sku ? `${p.name} [${p.sku}]` : p.name,
  }));

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="COLD STORAGE RENTAL"
          title="Penerimaan Barang Rental"
          description="Catat barang masuk dari customer berdasarkan kontrak sewa aktif. Tambah beberapa item sekaligus, lalu simpan sekaligus."
        />

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-slate-500">Memuat data…</span>
          </div>
        )}

        {!isLoading && (
          <form onSubmit={handleSubmit} noValidate>
            {/* ── Step 1: Kontrak ─────────────────────────────────────────── */}
            <section className="mb-8">
              <div className="rounded-xl border border-line bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    1
                  </span>
                  <h2 className="text-sm font-semibold text-ink">Pilih Kontrak Sewa Aktif</h2>
                </div>
                <div className="p-5">
                  <Select
                    label="Kontrak Sewa"
                    placeholder="— Pilih kontrak aktif —"
                    options={contractOptions}
                    value={selectedContractId}
                    onChange={(e) => setSelectedContractId(e.target.value)}
                  />
                  {selectedContract && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
                      <span className="font-medium text-ink">Customer:</span>{" "}
                      {selectedContract.customer_name ?? selectedContract.customer_id}
                      {" · "}
                      <span className="font-medium text-ink">Kontrak:</span>{" "}
                      {selectedContract.title}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Step 2: Item Lines ───────────────────────────────────────── */}
            <section className="mb-6">
              <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                {/* Section header */}
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                      2
                    </span>
                    <h2 className="text-sm font-semibold text-ink">Barang yang Diterima</h2>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLine}
                    disabled={!selectedContractId}
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Tambah Baris
                  </Button>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-12 gap-3 border-b border-line bg-slate-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <div className="col-span-3">Produk</div>
                  <div className="col-span-2">No. Batch</div>
                  <div className="col-span-1">Qty (kg)</div>
                  <div className="col-span-2">Tgl. Produksi</div>
                  <div className="col-span-2">Tgl. Expired</div>
                  <div className="col-span-2">
                    Lokasi Bin{" "}
                    <span className="normal-case font-normal lowercase">(ops.)</span>
                  </div>
                </div>

                {/* Line rows */}
                <div className="divide-y divide-slate-100">
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-12 gap-3 px-5 py-3 items-end"
                    >
                      <div className="col-span-3">
                        <Select
                          placeholder="Pilih produk"
                          options={productOptions}
                          value={line.productId}
                          onChange={(e) => updateLine(line.id, "productId", e.target.value)}
                          disabled={!selectedContractId}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          placeholder="mis. BL-2026-001"
                          value={line.batchNumber}
                          onChange={(e) => updateLine(line.id, "batchNumber", e.target.value)}
                          disabled={!selectedContractId}
                        />
                      </div>
                      <div className="col-span-1">
                        <Input
                          type="number"
                          placeholder="0"
                          min="0"
                          step="0.01"
                          value={line.qtyKg}
                          onChange={(e) => updateLine(line.id, "qtyKg", e.target.value)}
                          disabled={!selectedContractId}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="date"
                          value={line.productionDate}
                          onChange={(e) => updateLine(line.id, "productionDate", e.target.value)}
                          disabled={!selectedContractId}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="date"
                          value={line.expiryDate}
                          onChange={(e) => updateLine(line.id, "expiryDate", e.target.value)}
                          disabled={!selectedContractId}
                        />
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5">
                        <Input
                          placeholder="mis. A-01-L1"
                          value={line.binLocation}
                          onChange={(e) => updateLine(line.id, "binLocation", e.target.value)}
                          disabled={!selectedContractId}
                        />
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="mb-2.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-400 transition-all hover:border-red-200 hover:bg-red-50 hover:text-danger"
                            title="Hapus baris"
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-line bg-slate-50/50 px-5 py-3">
                  <span className="text-xs text-slate-500">
                    {lines.length} baris{itemsTotalKg > 0 && ` · Total ${itemsTotalKg.toLocaleString("id-ID")} kg`}
                  </span>
                  <span className="text-xs text-slate-500">{filledLines.length} terisi</span>
                </div>
              </div>
            </section>

            {/* ── Notes ────────────────────────────────────────────────────── */}
            <section className="mb-8">
              <Input
                label="Catatan"
                placeholder="Catatan opsional (kondisi barang, nama driver, dll.)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </section>

            {/* ── Feedback ──────────────────────────────────────────────────── */}
            {error && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                {success}
              </div>
            )}

            {/* ── Actions ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-end gap-3 pb-8">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setLines([newRow(1)]);
                  setNextId(2);
                  setNotes("");
                  setSelectedContractId("");
                  setError(null);
                  setSuccess(null);
                }}
              >
                Reset
              </Button>
              <Button
                type="submit"
                loading={isSaving}
                disabled={!selectedContractId || filledLines.length === 0}
              >
                <CheckIcon className="h-4 w-4" />
                Simpan{filledLines.length > 0 ? ` (${filledLines.length})` : ""} Item
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
