"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColdStorage {
  id: string;
  code: string;
  name: string;
  capacity_kg: number;
  capacity_units: number | null;
  status: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
  temperature_min: number | null;
  temperature_max: number | null;
  rows: number;
  columns: number;
  warehouses: { name: string } | null;
}

interface StorageBin {
  id: string;
  code: string;
  row: number;
  column: number;
  status: "EMPTY" | "OCCUPIED" | "RESERVED";
  current_kg: number | null;
  current_units: number | null;
  inventory?: {
    id: string;
    quantity: number;
    quantity_kg: number;
    products: { name: string; sku: string } | null;
    batches: { batch_number: string; expiry_date?: string } | null;
  }[];
}

interface FormData {
  code: string;
  name: string;
  capacity_kg: string;
  capacity_units: string;
  temperature_min: string;
  temperature_max: string;
  rows: string;
  columns: string;
  warehouse_id: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Aktif" },
  { value: "MAINTENANCE", label: "Perawatan" },
  { value: "INACTIVE", label: "Nonaktif" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Aktif", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  MAINTENANCE: { label: "Perawatan", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  INACTIVE: { label: "Nonaktif", cls: "bg-slate-100 text-slate-500 border border-slate-200" },
};

const BIN_COLORS: Record<string, string> = {
  OCCUPIED: "bg-emerald-500 border-emerald-600 hover:bg-emerald-400 cursor-pointer",
  EMPTY: "bg-slate-200 border-slate-300 hover:bg-slate-300 cursor-pointer",
  RESERVED: "bg-amber-400 border-amber-500 hover:bg-amber-300 cursor-pointer",
};

const BIN_LABEL_COLORS: Record<string, string> = {
  OCCUPIED: "text-white",
  EMPTY: "text-slate-500",
  RESERVED: "text-amber-900",
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ColdStoragesPage() {
  const [storages, setStorages] = useState<ColdStorage[]>([]);
  const [bins, setBins] = useState<StorageBin[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStorage, setSelectedStorage] = useState<ColdStorage | null>(null);
  const [selectedBin, setSelectedBin] = useState<StorageBin | null>(null);
  const [binContents, setBinContents] = useState<StorageBin[]>([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingStorage, setEditingStorage] = useState<ColdStorage | null>(null);
  const [formData, setFormData] = useState<FormData>({
    code: "", name: "", capacity_kg: "", capacity_units: "",
    temperature_min: "", temperature_max: "", rows: "4", columns: "6", warehouse_id: "",
  });
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // Load session / org
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getClaims();
      const orgId = (claimsData?.claims as { org_id?: string })?.org_id;
      if (!orgId) {
        const { data: m } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", (claimsData?.claims as { sub?: string })?.sub)
          .eq("is_active", true)
          .maybeSingle();
        setOrganizationId(m?.organization_id ?? null);
      } else {
        setOrganizationId(orgId);
      }

      const { data: wh } = await supabase
        .from("warehouses")
        .select("id, name")
        .order("name");
      setWarehouses(wh || []);
    }
    void init();
  }, []);

  // Load cold storages
  const loadStorages = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("cold_storages")
      .select("*, warehouses(name)")
      .eq("organization_id", organizationId)
      .order("code");
    setStorages((data as unknown as ColdStorage[]) || []);
    setIsLoading(false);
  }, [organizationId]);

  useEffect(() => { void loadStorages(); }, [loadStorages]);

  // Load bins when a storage is selected
  const loadBins = useCallback(async (storage: ColdStorage) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("storage_locations")
      .select(`
        id, code, row, column, status, current_kg, current_units,
        inventory(id, quantity, quantity_kg, products(name, sku), batches(batch_number, expiry_date))
      `)
      .eq("cold_storage_id", storage.id)
      .order("row")
      .order("column");

    if (data && data.length > 0) {
      setBins(data as unknown as StorageBin[]);
    } else {
      // Generate mock bins if none exist
      const mockBins: StorageBin[] = [];
      for (let r = 1; r <= storage.rows; r++) {
        for (let c = 1; c <= storage.columns; c++) {
          const rand = Math.random();
          const status: StorageBin["status"] =
            rand < 0.5 ? "OCCUPIED" : rand < 0.8 ? "EMPTY" : "RESERVED";
          mockBins.push({
            id: `${storage.id}-${r}-${c}`,
            code: `${String.fromCharCode(64 + r)}${c}`,
            row: r,
            column: c,
            status,
            current_kg: status === "OCCUPIED" ? Math.round(Math.random() * 500 + 50) : null,
            current_units: status === "OCCUPIED" ? Math.round(Math.random() * 10 + 1) : null,
          });
        }
      }
      setBins(mockBins);
    }
  }, []);

  const selectStorage = useCallback((storage: ColdStorage) => {
    setSelectedStorage(storage);
    setSelectedBin(null);
    setBinContents([]);
    void loadBins(storage);
  }, [loadBins]);

  const handleBinClick = useCallback(async (bin: StorageBin) => {
    setSelectedBin(bin);
    if (bin.status === "OCCUPIED" && bin.inventory) {
      setBinContents([bin]);
    } else if (bin.status === "OCCUPIED") {
      // Fetch full bin contents from DB
      const supabase = createClient();
      const { data } = await supabase
        .from("storage_locations")
        .select(`
          id, code, row, column, status, current_kg, current_units,
          inventory(id, quantity, quantity_kg, products(name, sku), batches(batch_number, expiry_date))
        `)
        .eq("id", bin.id)
        .single();
      setBinContents(data ? [data as unknown as StorageBin] : []);
    } else {
      setBinContents([]);
    }
  }, []);

  // Form handlers
  const openAddForm = () => {
    setEditingStorage(null);
    setFormData({ code: "", name: "", capacity_kg: "", capacity_units: "",
      temperature_min: "", temperature_max: "", rows: "4", columns: "6", warehouse_id: warehouses[0]?.id ?? "" });
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (storage: ColdStorage) => {
    setEditingStorage(storage);
    setFormData({
      code: storage.code, name: storage.name,
      capacity_kg: String(storage.capacity_kg),
      capacity_units: storage.capacity_units != null ? String(storage.capacity_units) : "",
      temperature_min: storage.temperature_min != null ? String(storage.temperature_min) : "",
      temperature_max: storage.temperature_max != null ? String(storage.temperature_max) : "",
      rows: String(storage.rows), columns: String(storage.columns),
      warehouse_id: "",
    });
    setFormError("");
    setShowForm(true);
  };

  const handleFormChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFormSave = async () => {
    if (!organizationId) return;
    setFormSaving(true);
    setFormError("");

    const payload: Record<string, unknown> = {
      code: formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      capacity_kg: Number(formData.capacity_kg),
      capacity_units: formData.capacity_units ? Number(formData.capacity_units) : null,
      temperature_min: formData.temperature_min ? Number(formData.temperature_min) : null,
      temperature_max: formData.temperature_max ? Number(formData.temperature_max) : null,
      rows: Number(formData.rows),
      columns: Number(formData.columns),
      organization_id: organizationId,
      ...(formData.warehouse_id ? { warehouse_id: formData.warehouse_id } : {}),
    };

    const supabase = createClient();

    if (editingStorage) {
      const { error } = await supabase
        .from("cold_storages")
        .update(payload)
        .eq("id", editingStorage.id);
      if (error) { setFormError(error.message); setFormSaving(false); return; }
    } else {
      const { error } = await supabase
        .from("cold_storages")
        .insert(payload);
      if (error) { setFormError(error.message); setFormSaving(false); return; }
    }

    setShowForm(false);
    setFormSaving(false);
    await loadStorages();
  };

  const handleDelete = async (storage: ColdStorage) => {
    if (!confirm(`Hapus cold storage "${storage.name}"?`)) return;
    const supabase = createClient();
    await supabase.from("cold_storages").delete().eq("id", storage.id);
    if (selectedStorage?.id === storage.id) { setSelectedStorage(null); setBins([]); }
    await loadStorages();
  };

  // Compute stats
  const totalCapacityKg = storages.reduce((s, cs) => s + cs.capacity_kg, 0);
  const totalBins = bins.length;
  const occupiedBins = bins.filter(b => b.status === "OCCUPIED").length;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="GUDANG"
          title={selectedStorage ? `Bin Rack — ${selectedStorage.name}` : "Cold Storage"}
          description={
            selectedStorage
              ? `Grid ${selectedStorage.rows} baris × ${selectedStorage.columns} kolom. Klik bin untuk melihat/menugaskan isi.`
              : "Kelola unit cold storage dan lokasi bin rak."
          }
          actions={
            !selectedStorage ? (
              <Button size="sm" onClick={openAddForm}>+ Tambah Cold Storage</Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => { setSelectedStorage(null); setBins([]); setSelectedBin(null); }}>
                ← Kembali ke Daftar
              </Button>
            )
          }
        />

        {/* ── Stats bar (storage list view) ── */}
        {!selectedStorage && (
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Total Unit", value: storages.length, cls: "text-2xl font-semibold text-ink" },
              { label: "Total Kapasitas", value: `${totalCapacityKg.toLocaleString("id-ID")} kg`, cls: "text-2xl font-semibold text-ink" },
              { label: "Aktif", value: storages.filter(s => s.status === "ACTIVE").length, cls: "text-2xl font-semibold text-emerald-600" },
              { label: "Perawatan", value: storages.filter(s => s.status === "MAINTENANCE").length, cls: "text-2xl font-semibold text-amber-600" },
            ].map((kpi, i) => (
              <div key={i} className="rounded-xl border border-line bg-white px-5 py-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-widest text-slate-400">{kpi.label}</p>
                <p className={kpi.cls}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Storage list ── */}
        {!selectedStorage && (
          <div className="rounded-xl border border-line bg-white shadow-sm">
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-sm text-slate-400">
                Memuat…
              </div>
            ) : storages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm text-slate-400">
                <svg className="mb-3 h-12 w-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 8.5 12 3l9 5.5v10.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6M9 17h6M3 9.5h18" />
                </svg>
                Belum ada cold storage. Klik "+ Tambah Cold Storage" untuk membuat.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {storages.map(cs => {
                  const badge = STATUS_BADGE[cs.status];
                  return (
                    <div
                      key={cs.id}
                      className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
                      onClick={() => selectStorage(cs)}
                    >
                      {/* Icon */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                        <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M3 8.5 12 3l9 5.5v10.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6M9 17h6M3 9.5h18" />
                        </svg>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-500">{cs.code}</span>
                          <span className="text-sm font-medium text-ink">{cs.name}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span>📦 {cs.capacity_kg.toLocaleString("id-ID")} kg</span>
                          {cs.capacity_units != null && <span>📦 {cs.capacity_units} unit</span>}
                          {cs.rows && cs.columns && (
                            <span>🗂 {cs.rows}×{cs.columns} bin</span>
                          )}
                          {cs.warehouses && <span>🏭 {cs.warehouses.name}</span>}
                          {cs.temperature_min != null && cs.temperature_max != null && (
                            <span>🌡 {cs.temperature_min}–{cs.temperature_max}°C</span>
                          )}
                        </div>
                      </div>

                      {/* Capacity bar */}
                      <div className="hidden w-24 shrink-0 sm:block">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-blue-400" style={{ width: "45%" }} />
                        </div>
                        <p className="mt-1 text-center text-xs text-slate-400">45% terpakai</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openEditForm(cs)}
                          className="rounded-lg border border-line p-2 text-slate-400 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                          title="Edit"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(cs)}
                          className="rounded-lg border border-line p-2 text-slate-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500"
                          title="Hapus"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Bin rack grid ── */}
        {selectedStorage && (
          <div>
            {/* Mini stats */}
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-4 py-2 shadow-sm">
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-slate-600">
                  Terisi <strong className="text-emerald-700">{occupiedBins}</strong> / {totalBins}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-4 py-2 shadow-sm">
                <span className="h-3 w-3 rounded-full bg-slate-200 border border-slate-300" />
                <span className="text-xs font-medium text-slate-600">Kosong</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-4 py-2 shadow-sm">
                <span className="h-3 w-3 rounded-full bg-amber-400 border border-amber-500" />
                <span className="text-xs font-medium text-slate-600">Direservasi</span>
              </div>
              <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                {selectedStorage.temperature_min != null && selectedStorage.temperature_max != null && (
                  <span>🌡 {selectedStorage.temperature_min}–{selectedStorage.temperature_max}°C</span>
                )}
                <span>📦 {selectedStorage.capacity_kg.toLocaleString("id-ID")} kg</span>
              </div>
            </div>

            {/* Grid */}
            <div
              className="rounded-xl border border-line bg-white p-6 shadow-sm"
              style={{
                display: "grid",
                gridTemplateColumns: `40px repeat(${selectedStorage.columns}, 1fr)`,
                gridTemplateRows: `40px repeat(${selectedStorage.rows}, 72px)`,
                gap: "8px",
              }}
            >
              {/* Column headers (numbers) */}
              {Array.from({ length: selectedStorage.columns }, (_, i) => (
                <div key={`ch-${i}`} className="flex items-center justify-center text-xs font-semibold text-slate-400">
                  {i + 1}
                </div>
              ))}

              {Array.from({ length: selectedStorage.rows }, (_, ri) => {
                const rowLetter = String.fromCharCode(65 + ri);
                return (
                  <>
                    {/* Row header (letter) */}
                    <div key={`rh-${ri}`} className="flex items-center justify-center text-xs font-semibold text-slate-400">
                      {rowLetter}
                    </div>

                    {/* Bins in this row */}
                    {Array.from({ length: selectedStorage.columns }, (_, ci) => {
                      const bin = bins.find(b => b.row === ri + 1 && b.column === ci + 1);
                      const isSelected = selectedBin?.id === bin?.id;
                      const color = bin ? BIN_COLORS[bin.status] : "bg-slate-100 border border-slate-200";
                      const labelColor = bin ? BIN_LABEL_COLORS[bin.status] : "text-slate-400";

                      return (
                        <div
                          key={`bin-${ri}-${ci}`}
                          onClick={() => bin && handleBinClick(bin)}
                          className={`
                            relative flex flex-col items-center justify-center rounded-lg border-2 font-mono text-xs font-bold
                            transition-all duration-100 select-none
                            ${color}
                            ${isSelected ? "ring-2 ring-primary ring-offset-2" : ""}
                            ${bin ? "shadow-sm" : "opacity-40"}
                          `}
                          title={bin ? `${bin.code} — ${bin.status}` : "Tidak tersedia"}
                        >
                          <span className={`${labelColor}`}>{bin?.code ?? "—"}</span>
                          {bin?.current_kg != null && (
                            <span className={`mt-0.5 text-[10px] font-normal ${labelColor}`}>
                              {bin.current_kg}kg
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })}
            </div>

            {/* Legend + selected bin detail */}
            {selectedBin && (
              <div className="mt-4 rounded-xl border border-line bg-white shadow-sm">
                <div className="border-b border-line px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`rounded-lg border-2 px-3 py-1 font-mono text-sm font-bold ${BIN_COLORS[selectedBin.status]} ${BIN_LABEL_COLORS[selectedBin.status]}`}>
                        {selectedBin.code}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {STATUS_BADGE[selectedBin.status]?.label ?? selectedBin.status}
                        </p>
                        <p className="text-xs text-slate-400">
                          Row {selectedBin.row}, Kolom {selectedBin.column}
                          {selectedBin.current_kg != null && ` · ${selectedBin.current_kg} kg`}
                        </p>
                      </div>
                    </div>
                    {selectedBin.status === "EMPTY" && (
                      <Button size="sm" className="bg-primary text-white hover:bg-primary/90">
                        + Tanam Barang
                      </Button>
                    )}
                  </div>
                </div>

                {/* Bin contents */}
                {selectedBin.status === "OCCUPIED" && (
                  <div className="divide-y divide-line">
                    {binContents[0]?.inventory && binContents[0].inventory.length > 0 ? (
                      binContents[0].inventory.map(item => (
                        <div key={item.id} className="flex items-center gap-4 px-5 py-3">
                          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                            <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-ink">{item.products?.name ?? "—"}</p>
                            <p className="text-xs text-slate-400">
                              SKU: {item.products?.sku ?? "—"} · Batch: {item.batches?.batch_number ?? "—"}
                              {item.batches?.expiry_date && ` · Exp: ${item.batches.expiry_date}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-ink">{item.quantity_kg?.toFixed(1)} kg</p>
                            <p className="text-xs text-slate-400">{item.quantity} unit</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-3 px-5 py-3">
                        <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                          <svg className="h-5 w-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-ink">Barang tersimpan</p>
                          <p className="text-xs text-slate-400">
                            {selectedBin.current_kg?.toLocaleString("id-ID")} kg
                            {selectedBin.current_units != null && ` · ${selectedBin.current_units} unit`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedBin.status === "RESERVED" && (
                  <div className="flex items-center gap-3 px-5 py-4">
                    <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                      <svg className="h-5 w-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-600">Bin ini sedang direservasi untuk penerimaan mendatang.</p>
                  </div>
                )}

                {selectedBin.status === "EMPTY" && (
                  <div className="flex items-center gap-3 px-5 py-4">
                    <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center">
                      <svg className="h-5 w-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-600">Bin kosong. Klik tombol "Tanam Barang" untuk menempatkan barang.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add/Edit modal ── */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingStorage ? "Edit Cold Storage" : "Tambah Cold Storage"}
        description="Isi informasi unit cold storage baru."
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Kode *"
              placeholder="CS-01"
              value={formData.code}
              onChange={e => handleFormChange("code", e.target.value)}
            />
            <Input
              label="Nama *"
              placeholder="Cold Storage Utama"
              value={formData.name}
              onChange={e => handleFormChange("name", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Kapasitas (kg) *"
              type="number"
              placeholder="5000"
              value={formData.capacity_kg}
              onChange={e => handleFormChange("capacity_kg", e.target.value)}
            />
            <Input
              label="Kapasitas (unit)"
              type="number"
              placeholder="100"
              value={formData.capacity_units}
              onChange={e => handleFormChange("capacity_units", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Suhu Min (°C)"
              type="number"
              placeholder="-25"
              value={formData.temperature_min}
              onChange={e => handleFormChange("temperature_min", e.target.value)}
            />
            <Input
              label="Suhu Maks (°C)"
              type="number"
              placeholder="-18"
              value={formData.temperature_max}
              onChange={e => handleFormChange("temperature_max", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Jumlah Baris Rack *"
              type="number"
              placeholder="4"
              value={formData.rows}
              onChange={e => handleFormChange("rows", e.target.value)}
            />
            <Input
              label="Jumlah Kolom Rack *"
              type="number"
              placeholder="6"
              value={formData.columns}
              onChange={e => handleFormChange("columns", e.target.value)}
            />
          </div>

          {warehouses.length > 0 && (
            <Select
              label="Gudang"
              value={formData.warehouse_id}
              onChange={e => handleFormChange("warehouse_id", e.target.value)}
              options={[
                { value: "", label: "— Tidak ada —" },
                ...warehouses.map(w => ({ value: w.id, label: w.name })),
              ]}
            />
          )}

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Batal</Button>
            <Button onClick={() => void handleFormSave()} disabled={formSaving}>
              {formSaving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
