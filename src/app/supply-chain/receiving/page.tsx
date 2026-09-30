"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierName { name: string; code: string }
interface PoNumber { po_number: string }

interface ReceivingRecord {
  id: string;
  receiving_number: string;
  po_id?: string;
  supplier_id: string;
  received_date: string;
  status: string;
  notes?: string;
  suppliers?: SupplierName;
  purchase_orders?: PoNumber;
}

interface PurchaseOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_id: string;
  unit_price?: number;
  received_quantity?: number;
  products?: { id: string; name: string; sku: string; unit_id: string };
  units?: { id: string; code: string };
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  order_date: string;
  expected_date: string;
  status: string;
  suppliers?: SupplierName;
  purchase_order_items?: PurchaseOrderItem[];
}

interface QcRecord {
  id: string;
  qc_number: string;
  receiving_id: string;
  batch_id?: string;
  product_id?: string;
  status: string;
  result?: string;
  inspected_at?: string;
  notes?: string;
}

interface ReceivingFormItem {
  po_item_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  unit_id: string;
  unit_code: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_price?: number;
  batch_number: string;
  production_date: string;
  expiry_date: string;
  cold_storage_id: string;
  storage_location_id: string;
  notes: string;
}

// ─── Status maps ────────────────────────────────────────────────────────────────

const receivingStatusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  PENDING:   { label: "Menunggu",     tone: "warning" },
  PARTIAL:   { label: "Sebagian",     tone: "warning" },
  COMPLETED: { label: "Selesai",      tone: "success" },
  CANCELLED: { label: "Dibatalkan",   tone: "danger"  },
};

const qcStatusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  ACCEPTED:       { label: "Diterima",        tone: "success" },
  PARTIAL_ACCEPT: { label: "Terima Sebagian", tone: "warning" },
  QUARANTINE:     { label: "Quarantine",     tone: "danger"  },
  REJECTED:       { label: "Ditolak",        tone: "danger"  },
};

const emptyFormItem = (): ReceivingFormItem => ({
  po_item_id: "", product_id: "", product_name: "", sku: "", unit_id: "", unit_code: "",
  quantity_ordered: 0, quantity_received: 0,
  batch_number: "", production_date: "", expiry_date: "",
  cold_storage_id: "", storage_location_id: "", notes: "",
});

const emptyForm = (): ReceivingFormItem[] => [emptyFormItem()];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReceivingPage() {
  const [activeTab, setActiveTab] = useState<"receiving" | "qc">("receiving");
  const [receiving, setReceiving] = useState<ReceivingRecord[]>([]);
  const [qc, setQc] = useState<QcRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Form data
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [coldStorages, setColdStorages] = useState<{ id: string; code: string; name: string }[]>([]);
  const [storageLocations, setStorageLocations] = useState<{ id: string; code: string; name: string; cold_storage_id: string }[]>([]);

  const [selectedPoId, setSelectedPoId] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formItems, setFormItems] = useState<ReceivingFormItem[]>(emptyForm());

  const selectedPo = purchaseOrders.find((po) => po.id === selectedPoId);

  // ── Load master data ─────────────────────────────────────────────────────
  async function loadLookups(organizationId: string) {
    const supabase = createClient();
  // ── Drop unused units query: units are embedded in the PO payload ──
    const [poRes, csRes, locRes] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select("id, po_number, order_date, expected_date, status, suppliers(name, code), purchase_order_items(id, product_id, quantity, unit_id, unit_price, received_quantity, products(id, name, sku, unit_id))")
        .eq("organization_id", organizationId)
        .eq("status", "APPROVED")
        .order("order_date", { ascending: false })
        .limit(50),
      supabase.from("cold_storages").select("id, code, name").eq("organization_id", organizationId).eq("status", "ACTIVE").order("code"),
      supabase.from("storage_locations").select("id, code, name, cold_storage_id").eq("organization_id", organizationId).eq("active", true).order("code"),
    ]);
    // PostgREST returns nested embeds as arrays; use unknown[] as the intermediate type.
    setPurchaseOrders((poRes.data || []) as unknown as PurchaseOrder[]);
    setColdStorages(csRes.data || []);
    setStorageLocations(locRes.data || []);
  }

  // ── Load receiving + QC records ─────────────────────────────────────────
  async function loadRecords(organizationId: string) {
    const supabase = createClient();
    const [recvRes, qcRes] = await Promise.all([
      supabase
        .from("receiving_records")
        .select("*, suppliers(name, code), purchase_orders(po_number)")
        .eq("organization_id", organizationId)
        .order("received_date", { ascending: false })
        .limit(50),
      supabase
        .from("qc_inspections")
        .select("id, qc_number, receiving_id, status, result, inspected_at, notes")
        .eq("organization_id", organizationId)
        .order("inspected_at", { ascending: false })
        .limit(50),
    ]);
    setReceiving((recvRes.data || []) as ReceivingRecord[]);
    setQc((qcRes.data || []) as QcRecord[]);
  }

  // ── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) { setIsLoading(false); return; }

      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("is_active", "true")
        .maybeSingle();
      if (!membership) { setIsLoading(false); return; }

      await Promise.all([loadRecords(membership.organization_id), loadLookups(membership.organization_id)]);
      setIsLoading(false);
    }
    void init();
  }, []);

  // ── PO selection: populate form items from PO items ────────────────────
  function handlePoChange(poId: string) {
    setSelectedPoId(poId);
    setFormItems(emptyForm());
    setFormError("");
    setFormSuccess("");

    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po?.purchase_order_items) return;

    const orgStorage = storageLocations.filter((l) => l.cold_storage_id);
    const firstCs = coldStorages[0];

    const items: ReceivingFormItem[] = (po.purchase_order_items || [])
      .filter((item) => (item.received_quantity || 0) < item.quantity)
      .map((item) => ({
        po_item_id: item.id,
        product_id: item.product_id,
        product_name: item.products?.name || "",
        sku: item.products?.sku || "",
        unit_id: item.units?.id || item.unit_id,
        unit_code: item.units?.code || "",
        quantity_ordered: item.quantity,
        quantity_received: Math.max(0, (item.quantity || 0) - (item.received_quantity || 0)),
        unit_price: item.unit_price,
        batch_number: "",
        production_date: "",
        expiry_date: "",
        cold_storage_id: firstCs?.id || "",
        storage_location_id: orgStorage.find((l) => l.cold_storage_id === firstCs?.id)?.id || "",
        notes: "",
      }));
    setFormItems(items.length ? items : emptyForm());
  }

  // ── Storage change: reset location ─────────────────────────────────────
  function handleStorageChange(itemIdx: number, csId: string) {
    setFormItems((prev) => {
      const next = [...prev];
      next[itemIdx] = { ...next[itemIdx], cold_storage_id: csId, storage_location_id: "" };
      return next;
    });
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    if (!selectedPoId) { setFormError("Pilih Purchase Order."); return; }
    const items = formItems.filter((i) => i.product_id);
    if (!items.length) { setFormError("Pilih item dari Purchase Order."); return; }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      const rpcItems = items
        .filter((item) => item.quantity_received > 0)
        .map((item) => ({
          po_item_id: item.po_item_id,
          product_id: item.product_id,
          actual_quantity: item.quantity_received,
          unit_id: item.unit_id,
          batch_number: item.batch_number || null,
          production_date: item.production_date || null,
          expiry_date: item.expiry_date || null,
          cold_storage_id: item.cold_storage_id || null,
          storage_location_id: item.storage_location_id || null,
          notes: item.notes || null,
        }));
      if (!rpcItems.length) { setFormError("Jumlah diterima tidak boleh 0 untuk semua item."); setSaving(false); return; }

      const { data, error } = await supabase.rpc("create_receiving_from_po", {
        p_po_id: selectedPoId,
        p_received_date: receivedDate,
        p_items: rpcItems,
        p_created_by: userId,  // null-safe: RPC defaults to auth.uid()
      });

      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      setFormSuccess(result?.msg || "Penerimaan berhasil dicatat.");

      // Reload records
      const { data: membership } = await supabase
        .from("organization_memberships").select("organization_id")
        .eq("user_id", userId).eq("is_active", "true").maybeSingle();
      if (membership) await loadRecords(membership.organization_id);

      // Reset form
      setSelectedPoId("");
      setFormItems(emptyForm());
      setTimeout(() => { setModalOpen(false); setFormSuccess(""); }, 1800);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan penerimaan.");
    } finally {
      setSaving(false);
    }
  }

  const filteredLocations = (csId: string) =>
    storageLocations.filter((l) => l.cold_storage_id === csId);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SUPPLY CHAIN"
          title="Penerimaan & QC"
          description="Kelola penerimaan barang dan kendali mutu."
          actions={
            <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Penerimaan Baru
            </Button>
          }
        />

        {/* Tabs */}
        <div className="mb-6 flex items-center gap-4 border-b border-line">
          {(["receiving", "qc"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-1 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-slate-500 hover:text-ink"
              }`}
            >
              {tab === "receiving" ? "Penerimaan" : "Kendali Mutu"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : activeTab === "receiving" ? (
          receiving.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink">Belum ada penerimaan</h3>
              <p className="mt-2 text-sm text-slate-500">Klik <strong>Penerimaan Baru</strong> untuk mencatat barang masuk.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor GR</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">PO Reference</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Supplier</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Tanggal</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {receiving.map((record) => {
                      const statusInfo = receivingStatusOptions[record.status] || { label: record.status, tone: "neutral" as const };
                      return (
                        <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{record.receiving_number}</td>
                          <td className="px-4 py-3 text-sm text-ink">{record.purchase_orders?.po_number || "—"}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-ink">{record.suppliers?.name || "—"}</p>
                            <p className="text-xs text-slate-500">{record.suppliers?.code || "—"}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">{formatDate(record.received_date)}</td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button className="text-xs font-medium text-primary hover:underline">Lihat</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          qc.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink">Belum ada data QC</h3>
              <p className="mt-2 text-sm text-slate-500">QC inspection akan tercatat setelah penerimaan barang.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor QC</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">ID Penerimaan</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Hasil</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Tanggal</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {qc.map((record) => {
                      const resultInfo = qcStatusOptions[record.result || ""] || { label: record.result || "—", tone: "neutral" as const };
                      const statusInfo = qcStatusOptions[record.status] || { label: record.status, tone: "neutral" as const };
                      return (
                        <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{record.qc_number}</td>
                          <td className="px-4 py-3 text-sm font-mono text-slate-500">{record.receiving_id?.slice(0, 8)}…</td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge tone={resultInfo.tone}>{resultInfo.label}</StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">{record.inspected_at ? formatDate(record.inspected_at) : "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Goods-in Modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setFormError(""); setFormSuccess(""); }}
        title="Penerimaan Barang Baru"
        description="Catat barang masuk berdasarkan Purchase Order yang sudah disetujui."
        size="xl"
      >
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          {/* PO + Date */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Purchase Order"
              required
              options={[
                { value: "", label: "— Pilih PO —" },
                ...purchaseOrders.map((po) => ({
                  value: po.id,
                  label: `${po.po_number}  ·  ${po.suppliers?.name ?? ""}  ·  ${formatDate(po.order_date)}`,
                })),
              ]}
              value={selectedPoId}
              onChange={(e) => handlePoChange(e.target.value)}
            />
            <Input
              label="Tanggal Penerimaan"
              type="date"
              required
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>

          {/* Line items */}
          {selectedPoId && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink border-b border-line pb-2">
                Item PO ({selectedPo?.po_number})
              </h3>
              {formItems.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-line bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink">{item.product_name || "—"}</p>
                      <p className="text-xs text-slate-500">SKU: {item.sku || "—"}  ·  Dipesan: {item.quantity_ordered} {item.unit_code}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-500 text-sm ml-2"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Input
                      label="Diterima"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity_received || ""}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setFormItems((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], quantity_received: v };
                          return next;
                        });
                      }}
                    />
                    <Input
                      label="Batch / Lot"
                      value={item.batch_number}
                      onChange={(e) => {
                        setFormItems((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], batch_number: e.target.value };
                          return next;
                        });
                      }}
                      placeholder="Opsional"
                    />
                    <Input
                      label="Tgl Produksi"
                      type="date"
                      value={item.production_date}
                      onChange={(e) => {
                        setFormItems((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], production_date: e.target.value };
                          return next;
                        });
                      }}
                    />
                    <Input
                      label="Tgl Kedaluwarsa"
                      type="date"
                      value={item.expiry_date}
                      onChange={(e) => {
                        setFormItems((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], expiry_date: e.target.value };
                          return next;
                        });
                      }}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Select
                      label="Cold Storage"
                      options={[
                        { value: "", label: "—" },
                        ...coldStorages.map((cs) => ({ value: cs.id, label: `${cs.code} · ${cs.name}` })),
                      ]}
                      value={item.cold_storage_id}
                      onChange={(e) => handleStorageChange(idx, e.target.value)}
                    />
                    <Select
                      label="Lokasi Penyimpanan"
                      options={[
                        { value: "", label: "—" },
                        ...filteredLocations(item.cold_storage_id).map((loc) => ({
                          value: loc.id,
                          label: `${loc.code} · ${loc.name}`,
                        })),
                      ]}
                      value={item.storage_location_id}
                      onChange={(e) => {
                        setFormItems((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], storage_location_id: e.target.value };
                          return next;
                        });
                      }}
                      disabled={!item.cold_storage_id}
                    />
                    <Input
                      label="Catatan"
                      value={item.notes}
                      onChange={(e) => {
                        setFormItems((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], notes: e.target.value };
                          return next;
                        });
                      }}
                      placeholder="Opsional"
                    />
                  </div>
                </div>
              ))}

              {formItems.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">
                  Semua item PO sudah diterima sepenuhnya.
                </p>
              )}
            </div>
          )}

          {/* Feedback */}
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
          )}
          {formSuccess && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{formSuccess}</div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan Penerimaan"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
