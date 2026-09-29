"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatNumber } from "@/lib/utils";
import { useSession } from "@/hooks/use-permissions";

/* -------------------------------------------------------------------- */
/* Types                                                                  */
/* -------------------------------------------------------------------- */

interface ContractOption {
  id: string;
  contract_number: string;
  title: string;
  customer_id: string;
  rental_contracts_customer_fkey?: { name: string } | { name: string }[];
}

interface AllocationRow {
  id: string;
  allocation_number: string;
  active_quantity_kg: number;
  released_quantity_kg: number;
  status: string;
  product_id: string;
  contracts: { contract_number: string; title: string } | null;
  customers: { name: string } | null;
  products: { id: string; name: string; sku: string } | null;
  batches: { batch_number: string; expiry_date: string | null } | null;
  cold_storages: { code: string } | null;
  storage_locations: { code: string } | null;
}

interface ReleaseItem {
  allocationId: string;
  allocationNumber: string;
  productName: string;
  productSku: string;
  batchNumber: string;
  expiryDate: string | null;
  coldStorageCode: string;
  locationCode: string;
  activeQtyKg: number;
  releasedQtyKg: number;
  selected: boolean;
  releaseQtyKg: string;
  reason: string;
  notes: string;
}

interface ReleasePayload {
  allocation_id: string;
  quantity_kg: number;
  reason: string;
  notes: string | null;
  performed_by: string;
  approval_request_id: string | null;
}

/* -------------------------------------------------------------------- */
/* Constants                                                              */
/* -------------------------------------------------------------------- */

const RELEASE_REASONS = [
  { value: "CUSTOMER_REQUEST", label: "Permintaan pelanggan" },
  { value: "CONTRACT_END", label: "Akhir kontrak" },
  { value: "QUALITY", label: "Kualitas" },
  { value: "RETURN_TO_SUPPLIER", label: "Kembalikan ke supplier" },
  { value: "OTHER", label: "Lainnya" },
];

const REASON_OPTIONS = [
  { value: "", label: "Pilih alasan" },
  ...RELEASE_REASONS,
];

/* -------------------------------------------------------------------- */
/* Page Component                                                         */
/* -------------------------------------------------------------------- */

export default function RentalReleasePage() {
  const { userId, organizationId, loaded: sessionLoaded } = useSession();

  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [releaseItems, setReleaseItems] = useState<ReleaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* Load active contracts on mount */
  useEffect(() => {
    if (!sessionLoaded || !organizationId) return;

    async function loadContracts() {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("rental_contracts")
        .select("id, contract_number, title, customer_id, rental_contracts_customer_fkey(name)")
        .eq("organization_id", organizationId)
        .eq("status", "ACTIVE")
        .order("contract_number");
      if (err) { setError(err.message); return; }
      setContracts(data ?? []);
    }

    void loadContracts();
  }, [sessionLoaded, organizationId]);

  /* Load allocations when a contract is selected */
  useEffect(() => {
    if (!sessionLoaded || !organizationId || !selectedContractId) {
      setAllocations([]);
      setReleaseItems([]);
      return;
    }

    async function loadAllocations() {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("rental_allocations")
        .select(
          "id, allocation_number, active_quantity_kg, released_quantity_kg, status, product_id, " +
          "contracts: rental_contracts(contract_number, title), " +
          "customers(name), " +
          "products:products(id, name, sku), " +
          "batches(batch_number, expiry_date), " +
          "cold_storages(code), " +
          "storage_locations(code)"
        )
        .eq("organization_id", organizationId)
        .eq("contract_id", selectedContractId)
        .in("status", ["ACTIVE", "PARTIALLY_RELEASED"])
        .order("allocated_at", { ascending: false });

      if (err) { setError(err.message); setIsLoading(false); return; }

      const rows = (data ?? []) as unknown as AllocationRow[];
      setAllocations(rows);
      setReleaseItems(rows.map((a) => ({
        allocationId: a.id,
        allocationNumber: a.allocation_number,
        productName: a.products?.name ?? "\u2212",
        productSku: a.products?.sku ?? "\u2212",
        batchNumber: a.batches?.batch_number ?? "\u2212",
        expiryDate: a.batches?.expiry_date ?? null,
        coldStorageCode: a.cold_storages?.code ?? "\u2212",
        locationCode: a.storage_locations?.code ?? "\u2212",
        activeQtyKg: Number(a.active_quantity_kg),
        releasedQtyKg: Number(a.released_quantity_kg),
        selected: false,
        releaseQtyKg: "",
        reason: "",
        notes: "",
      })));
      setIsLoading(false);
    }

    void loadAllocations();
  }, [sessionLoaded, organizationId, selectedContractId]);

  /* ------------------------------------------------------------------ */
  /* Handlers                                                             */
  /* ------------------------------------------------------------------ */

  const toggleItem = useCallback((allocationId: string) => {
    setReleaseItems((prev) =>
      prev.map((item) =>
        item.allocationId === allocationId
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  }, []);

  const updateItem = useCallback(
    (allocationId: string, field: keyof ReleaseItem, value: string) => {
      setReleaseItems((prev) =>
        prev.map((item) =>
          item.allocationId === allocationId ? { ...item, [field]: value } : item
        )
      );
    },
    []
  );

  const selectedItems = releaseItems.filter((i) => i.selected);

  function validateAndBuildPayload(): ReleasePayload[] {
    const payloads: ReleasePayload[] = [];
    for (const item of selectedItems) {
      const qty = Number(item.releaseQtyKg);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(
          `Jumlah pelepasan untuk ${item.allocationNumber} harus lebih dari nol.`
        );
      }
      if (qty > item.activeQtyKg) {
        throw new Error(
          `Jumlah pelepasan untuk ${item.allocationNumber} tidak boleh melebihi ${formatNumber(item.activeQtyKg)} KG.`
        );
      }
      if (!item.reason) {
        throw new Error(`Pilih alasan pelepasan untuk ${item.allocationNumber}.`);
      }
      payloads.push({
        allocation_id: item.allocationId,
        quantity_kg: qty,
        reason: item.reason,
        notes: item.notes || null,
        performed_by: userId ?? "",
        approval_request_id: null,
      });
    }
    return payloads;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (selectedItems.length === 0) {
      setError("Pilih minimal satu item untuk dilepas.");
      return;
    }

    let payloads: ReleasePayload[];
    try {
      payloads = validateAndBuildPayload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validasi gagal.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const results: string[] = [];
    const errors: string[] = [];

    for (const payload of payloads) {
      const { data, error: rpcErr } = await supabase.rpc("release_rental_stock", payload);
      if (rpcErr) { errors.push(`${payload.allocation_id}: ${rpcErr.message}`); continue; }
      const result = data?.[0];
      if (!result?.success) { errors.push(`${payload.allocation_id}: ${result?.message ?? "Gagal."}`); continue; }
      results.push(payload.allocation_id);
    }

    if (errors.length > 0) {
      setError(`Gagal melepas ${errors.length} item: ${errors.join("; ")}`);
    }
    if (results.length > 0) {
      setSuccess(`${results.length} item berhasil dilepas.`);
      setSelectedContractId(selectedContractId);
      setReleaseItems((prev) => prev.filter((i) => !results.includes(i.allocationId)));
    }

    setIsSubmitting(false);
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */

  if (!sessionLoaded) {
    return (
      <AppShell>
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          Memuat sesi\u2026
        </div>
      </AppShell>
    );
  }

  if (!userId) {
    return (
      <AppShell>
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          Silakan login terlebih dahulu.
        </div>
      </AppShell>
    );
  }

  const totalReleaseQty = selectedItems.reduce(
    (sum, i) => sum + (Number(i.releaseQtyKg) || 0),
    0
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="COLD STORAGE RENTAL"
          title="Pelepasan Barang"
          description="Lepas stok customer-owned dari cold storage berdasarkan kontrak aktif."
        />

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}

        {success && (
          <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {success}
          </div>
        )}

        {/* -- Contract Selector ----------------------------------------- */}
        <section className="mb-6">
          <div className="rounded-xl border border-line bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              1 \u00b7 Pilih Kontrak Rental
            </h2>
            <Select
              label="Kontrak Aktif"
              options={[
                { value: "", label: "\u2014 Pilih kontrak \u2014" },
                ...contracts.map((c) => ({
                  value: c.id,
                  label: `${c.contract_number} · ${c.title} (${Array.isArray(c.rental_contracts_customer_fkey) ? c.rental_contracts_customer_fkey[0]?.name : c.rental_contracts_customer_fkey?.name ?? "−"})`,
                })),
              ]}
              value={selectedContractId}
              onChange={(e) => setSelectedContractId(e.target.value)}
            />
          </div>
        </section>

        {/* -- Allocation Table ------------------------------------------ */}
        {selectedContractId && (
          <section className="mb-6">
            <div className="rounded-xl border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  2 \u00b7 Pilih Item untuk Dilepas
                </h2>
                <span className="text-xs text-slate-400">
                  {allocations.length} alokasi ditemukan
                </span>
              </div>

              {isLoading ? (
                <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                  Memuat alokasi\u2026
                </div>
              ) : allocations.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  Tidak ada alokasi aktif pada kontrak ini.
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line bg-slate-50 text-xs font-medium uppercase text-slate-500">
                          <th className="w-10 px-4 py-3 text-center">
                            <span className="sr-only">Pilih</span>
                          </th>
                          <th className="px-4 py-3 text-left">Produk</th>
                          <th className="px-4 py-3 text-left">Batch</th>
                          <th className="px-4 py-3 text-left">Lokasi</th>
                          <th className="px-4 py-3 text-right">Sisa (KG)</th>
                          <th className="px-4 py-3 text-right">Sudah Dilepas (KG)</th>
                          <th className="px-4 py-3 text-left">Jumlah Dilepas (KG)</th>
                          <th className="px-4 py-3 text-left">Alasan</th>
                          <th className="px-4 py-3 text-left">Catatan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {releaseItems.map((item) => (
                          <tr
                            key={item.allocationId}
                            className={`border-b border-line transition-colors ${
                              item.selected
                                ? "bg-blue-50"
                                : "hover:bg-slate-50"
                            }`}
                          >
                            <td className="px-4 py-3 text-center">
                              <Checkbox
                                checked={item.selected}
                                onChange={() => toggleItem(item.allocationId)}
                                aria-label={`Pilih ${item.allocationNumber}`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-ink">{item.productName}</div>
                              <div className="text-xs text-slate-400">{item.productSku}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{item.batchNumber}</div>
                              <div className="text-xs text-slate-400">
                                Exp: {item.expiryDate ? formatDate(item.expiryDate) : "\u2212"}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{item.coldStorageCode}</div>
                              <div className="text-xs text-slate-400">{item.locationCode}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                              {formatNumber(item.activeQtyKg)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                              {formatNumber(item.releasedQtyKg)}
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                min="0.001"
                                max={item.activeQtyKg}
                                step="0.001"
                                placeholder="0"
                                value={item.releaseQtyKg}
                                onChange={(e) =>
                                  updateItem(item.allocationId, "releaseQtyKg", e.target.value)
                                }
                                disabled={!item.selected}
                                className="w-28"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Select
                                options={REASON_OPTIONS}
                                value={item.reason}
                                onChange={(e) =>
                                  updateItem(item.allocationId, "reason", e.target.value)
                                }
                                disabled={!item.selected}
                                className="w-44"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Textarea
                                rows={1}
                                placeholder="Opsional"
                                value={item.notes}
                                onChange={(e) =>
                                  updateItem(item.allocationId, "notes", e.target.value)
                                }
                                disabled={!item.selected}
                                className="w-32"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* -- Submit Bar ---------------------------------------- */}
                  <div className="sticky bottom-0 border-t border-line bg-white px-5 py-4 flex items-center justify-between gap-4">
                    <div className="text-sm text-slate-500">
                      <span className="font-semibold text-ink">{selectedItems.length}</span> item dipilih &nbsp;&nbsp;
                      Total:{" "}
                      <span className="font-semibold tabular-nums text-ink">
                        {formatNumber(totalReleaseQty)} KG
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge tone={selectedItems.length > 0 ? "info" : "neutral"}>
                        {selectedItems.length > 0 ? "Siap diproses" : "Pilih item"}
                      </StatusBadge>
                      <Button
                        type="submit"
                        disabled={selectedItems.length === 0 || isSubmitting}
                        loading={isSubmitting}
                      >
                        Proses Pelepasan
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </section>
        )}

        {/* -- Helper hint ---------------------------------------------- */}
        {!selectedContractId && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
            <svg className="mx-auto mb-2 h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Pilih kontrak rental di atas untuk melihat item yang tersedia dilepas.
          </div>
        )}
      </div>
    </AppShell>
  );
}
