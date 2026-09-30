"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle,
  Gauge,
  Pencil,
  Plus,
  Thermometer,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/page-header";
import {
  AnimatedNumber,
  MotionCard,
  PageTransition,
  Stagger,
  StaggerItem,
} from "@/components/motion";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { useSession } from "@/hooks/use-permissions";

/* -------------------------------------------------------------------- */
/* Types                                                                  */
/* -------------------------------------------------------------------- */

interface RateRow {
  id: string;
  rate_number: string;
  rate_type: string;
  customer_id: string | null;
  cold_storage_id: string | null;
  storage_location_id: string | null;
  product_category_id: string | null;
  product_id: string | null;
  rate_per_kg_day: number;
  currency: string;
  minimum_quantity_kg: number | null;
  minimum_days: number | null;
  discount_percentage: number;
  effective_from: string;
  effective_to: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  customer?: { id: string; name: string } | null;
  cold_storage?: { id: string; name: string } | null;
  storage_location?: { id: string; code: string; name: string } | null;
  product?: { id: string; name: string; sku: string } | null;
}

interface SelectorOption {
  value: string;
  label: string;
  /** Present only for storage-location options: enables real filtering. */
  coldStorageId?: string;
}

interface KpiData {
  totalActive: number;
  avgRate: number;
  contractCount: number;
}

/* -------------------------------------------------------------------- */
/* Helpers                                                                */
/* -------------------------------------------------------------------- */

const RATE_TYPE_LABELS: Record<string, string> = {
  STANDARD: "Standar",
  CUSTOMER: "Per Customer",
  STORAGE: "Per Cold Storage",
  LOCATION: "Per Lokasi",
  CATEGORY: "Per Kategori",
  PRODUCT: "Per Produk",
};

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  PENDING_APPROVAL: "warning",
  INACTIVE: "neutral",
};

/* -------------------------------------------------------------------- */
/* Form                                                                   */
/* -------------------------------------------------------------------- */

interface RateForm {
  rate_type: string;
  customer_id: string;
  cold_storage_id: string;
  storage_location_id: string;
  product_category_id: string;
  product_id: string;
  rate_per_kg_day: string;
  minimum_quantity_kg: string;
  minimum_days: string;
  discount_percentage: string;
  effective_from: string;
  effective_to: string;
  notes: string;
  status: string;
}

const BLANK_FORM: RateForm = {
  rate_type: "STANDARD",
  customer_id: "",
  cold_storage_id: "",
  storage_location_id: "",
  product_category_id: "",
  product_id: "",
  rate_per_kg_day: "",
  minimum_quantity_kg: "",
  minimum_days: "",
  discount_percentage: "0",
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: "",
  notes: "",
  status: "ACTIVE",
};

/* -------------------------------------------------------------------- */
/* Component                                                              */
/* -------------------------------------------------------------------- */

export default function RentalRatesPage() {
  const router = useRouter();
  const { userId, organizationId, permissions, isDirector, loaded } = useSession();

  const [rates, setRates] = useState<RateRow[]>([]);
  const [kpi, setKpi] = useState<KpiData>({ totalActive: 0, avgRate: 0, contractCount: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Selectors
  const [customers, setCustomers] = useState<SelectorOption[]>([]);
  const [coldStorages, setColdStorages] = useState<SelectorOption[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectorOption[]>([]);
  const [productCategories, setProductCategories] = useState<SelectorOption[]>([]);
  const [products, setProducts] = useState<SelectorOption[]>([]);
  const [filteredLocations, setFilteredLocations] = useState<SelectorOption[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<SelectorOption[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editRate, setEditRate] = useState<RateRow | null>(null);
  const [form, setForm] = useState<RateForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<RateRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Read gate: any rental access role can see the table.
  const canRead =
    permissions.has("rental.view") ||
    permissions.has("rental.create") ||
    permissions.has("rental.manage") ||
    isDirector;

  // Write gate: only roles that can mutate rates.
  const canWrite =
    permissions.has("rental.create") ||
    permissions.has("rental.manage") ||
    isDirector;

  /* ---- fetch selectors ---- */
  const fetchSelectors = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    const [cust, cs, sl, pc, prod] = await Promise.all([
      supabase.from("customers").select("id,name").order("name"),
      supabase.from("cold_storages").select("id,name").order("name"),
      supabase.from("storage_locations").select("id,code,name,cold_storage_id").order("code"),
      supabase.from("product_categories").select("id,name").order("name"),
      supabase.from("products").select("id,name,sku").order("name"),
    ]);
    setCustomers((cust.data ?? []).map((r) => ({ value: r.id, label: r.name })));
    setColdStorages((cs.data ?? []).map((r) => ({ value: r.id, label: r.name })));
    setStorageLocations(
      (sl.data ?? []).map((r) => ({
        value: r.id,
        label: `${r.code} — ${r.name}`,
        coldStorageId: r.cold_storage_id,
      }))
    );
    setProductCategories((pc.data ?? []).map((r) => ({ value: r.id, label: r.name })));
    setProducts((prod.data ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.sku})` })));
  }, [organizationId]);

  /* ---- fetch rates ---- */
  const fetchRates = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    setLoading(true);
    const { data, error } = await supabase
      .from("rental_rates")
      .select(
        `*, customer:customers(id,name), cold_storage:cold_storages(id,name),
         storage_location:storage_locations(id,code,name),
         product:products(id,name,sku)`
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setRates(data as unknown as RateRow[]);
      const active = data.filter((r: unknown) => (r as RateRow).status === "ACTIVE");
      const contracts = data.filter(
        (r: unknown) =>
          (r as RateRow).rate_type === "CONTRACT" && (r as RateRow).status === "ACTIVE"
      );
      const rates2 = active.filter((r: unknown) => (r as RateRow).rate_per_kg_day > 0);
      const avg =
        rates2.length > 0
          ? rates2.reduce((s: number, r: unknown) => s + (r as RateRow).rate_per_kg_day, 0) /
            rates2.length
          : 0;
      setKpi({ totalActive: active.length, avgRate: avg, contractCount: contracts.length });
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (loaded && !userId) {
      router.replace("/login");
      return;
    }
    if (!loaded || !organizationId) return;
    // Local async runner (codebase convention): keeps setState out of the
    // synchronous effect body so the hooks lint stays clean.
    async function load() {
      await fetchSelectors();
      await fetchRates();
    }
    void load();
  }, [loaded, userId, organizationId, fetchSelectors, fetchRates, router]);

  /* ---- form ---- */
  function openCreate() {
    setEditRate(null);
    setForm(BLANK_FORM);
    setFormError("");
    setFilteredLocations([]);
    setFilteredProducts([]);
    setModalOpen(true);
  }

  function openEdit(rate: RateRow) {
    setEditRate(rate);
    setForm({
      rate_type: rate.rate_type,
      customer_id: rate.customer_id ?? "",
      cold_storage_id: rate.cold_storage_id ?? "",
      storage_location_id: rate.storage_location_id ?? "",
      product_category_id: rate.product_category_id ?? "",
      product_id: rate.product_id ?? "",
      rate_per_kg_day: String(rate.rate_per_kg_day),
      minimum_quantity_kg: rate.minimum_quantity_kg ? String(rate.minimum_quantity_kg) : "",
      minimum_days: rate.minimum_days ? String(rate.minimum_days) : "",
      discount_percentage: String(rate.discount_percentage),
      effective_from: rate.effective_from,
      effective_to: rate.effective_to ?? "",
      notes: rate.notes ?? "",
      status: rate.status,
    });
    setFormError("");
    // filter locations by the rate's cold storage (real filter, not a no-op)
    setFilteredLocations(
      storageLocations.filter(
        (sl) => !rate.cold_storage_id || sl.coldStorageId === rate.cold_storage_id
      )
    );
    setFilteredProducts(productCategories.length > 0 ? products : []);
    setModalOpen(true);
  }

  function handleColdStorageChange(id: string) {
    setForm((f) => ({ ...f, cold_storage_id: id, storage_location_id: "" }));
    setFilteredLocations(
      storageLocations.filter((sl) => !id || sl.coldStorageId === id)
    );
  }

  function handleCategoryChange(id: string) {
    setForm((f) => ({ ...f, product_category_id: id, product_id: "" }));
    setFilteredProducts(products);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId || !userId) return;

    const discount = parseFloat(form.discount_percentage) || 0;
    if (discount > 10 && !isDirector) {
      setFormError("Diskon di atas 10% hanya bisa disetujui oleh Director.");
      return;
    }

    setSaving(true);
    setFormError("");

    const supabase = createClient();
    const payload = {
      p_organization_id: organizationId,
      p_rate_type: form.rate_type,
      p_rate_per_kg_day: parseFloat(form.rate_per_kg_day),
      p_effective_from: form.effective_from,
      p_performed_by: userId,
      p_customer_id: form.customer_id || null,
      p_cold_storage_id: form.cold_storage_id || null,
      p_storage_location_id: form.storage_location_id || null,
      p_product_category_id: form.product_category_id || null,
      p_product_id: form.product_id || null,
      p_discount_percentage: discount,
      p_effective_to: form.effective_to || null,
      p_notes: form.notes || null,
      p_minimum_quantity_kg: parseFloat(form.minimum_quantity_kg) || 0,
      p_minimum_days: parseInt(form.minimum_days) || 0,
    };

    if (editRate) {
      // Update existing rate via direct table update
      const { error } = await supabase
        .from("rental_rates")
        .update({
          rate_type: form.rate_type,
          customer_id: form.customer_id || null,
          cold_storage_id: form.cold_storage_id || null,
          storage_location_id: form.storage_location_id || null,
          product_category_id: form.product_category_id || null,
          product_id: form.product_id || null,
          rate_per_kg_day: parseFloat(form.rate_per_kg_day),
          minimum_quantity_kg: parseFloat(form.minimum_quantity_kg) || null,
          minimum_days: parseInt(form.minimum_days) || null,
          discount_percentage: discount,
          effective_from: form.effective_from,
          effective_to: form.effective_to || null,
          notes: form.notes || null,
          status: form.status,
        })
        .eq("id", editRate.id);
      if (error) {
        setFormError(error.message ?? "Gagal menyimpan perubahan.");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.rpc("create_rental_rate", payload);
      if (error) {
        const msg = error.message ?? "Gagal menyimpan tarif.";
        if (msg.includes("Director")) {
          setFormError("Diskon di atas 10% memerlukan persetujuan Director.");
        } else {
          setFormError(msg);
        }
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setModalOpen(false);
    void fetchRates();
  }

  async function handleDelete() {
    if (!deleteTarget || !organizationId) return;
    setDeleting(true);
    const supabase = createClient();
    // Soft-delete: set status to INACTIVE (historical rates are never hard-deleted)
    const { error } = await supabase
      .from("rental_rates")
      .update({ status: "INACTIVE" })
      .eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      setFormError(error.message ?? "Gagal menonaktifkan tarif.");
      return;
    }
    setDeleteTarget(null);
    void fetchRates();
  }

  /* ---- search ---- */
  const visible = rates.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.rate_number.toLowerCase().includes(q) ||
      r.customer?.name.toLowerCase().includes(q) ||
      r.cold_storage?.name.toLowerCase().includes(q) ||
      r.storage_location?.name.toLowerCase().includes(q)
    );
  });

  /* ---- guard ---- */
  if (!loaded) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!canRead) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md pt-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <AlertTriangle className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-ink">Akses Terbatas</h2>
          <p className="mt-2 text-sm text-slate-500">
            Anda tidak memiliki izin untuk melihat modul Tarif Sewa.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTransition>
        <PageHeader
          eyebrow="COLD STORAGE"
          title="Tarif Sewa"
          description="Pengaturan tarif sewa cold storage per kg/hari. Harga sudah termasuk PPN, listrik, jasa, maintenance & kebersihan."
          actions={
            <Button onClick={canWrite ? openCreate : undefined} icon={<Plus className="h-4 w-4" />} disabled={!canWrite}>
              Tambah Tarif
            </Button>
          }
        />

        {/* KPI cluster */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Stagger>
            {[
              {
                label: "Tarif Aktif",
                value: kpi.totalActive,
                icon: <CheckCircle className="h-5 w-5 text-success" />,
                sub: "tarif dengan status aktif",
              },
              {
                label: "Rata-rata Tarif",
                value: kpi.avgRate,
                prefix: "Rp ",
                suffix: "/kg",
                icon: <Gauge className="h-5 w-5 text-primary" />,
                sub: "tarif per kilogram per hari",
              },
              {
                label: "Kontrak Aktif",
                value: kpi.contractCount,
                icon: <Thermometer className="h-5 w-5 text-accent" />,
                sub: "kontrak sewa cold storage",
              },
            ].map((kpi) => (
              <StaggerItem key={kpi.label}>
                <MotionCard className="app-surface-raised rounded-xl p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {kpi.label}
                    </span>
                    {kpi.icon}
                  </div>
                  <div className="text-2xl font-bold text-ink tabular">
                    {kpi.prefix ?? ""}
                    <AnimatedNumber value={kpi.value} />
                    {kpi.suffix ?? ""}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{kpi.sub}</p>
                </MotionCard>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        {/* Search */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor tarif, customer, atau cold storage..."
              className="app-surface w-full rounded-xl border border-line bg-white px-4 py-2.5 pl-10 text-sm text-ink shadow-sm placeholder:text-slate-400 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth={1.8} />
                <path d="m21 21-4.35-4.35" strokeWidth={1.8} strokeLinecap="round" />
              </svg>
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="app-surface overflow-hidden rounded-xl">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 rounded-full bg-slate-100 p-4">
                <Thermometer className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-ink">Belum ada tarif sewa</h3>
              <p className="mt-1 text-sm text-slate-500">
                {search ? "Tidak ada hasil pencarian." : "Tambahkan tarif sewa pertama."}
              </p>
              {!search && (
                <Button onClick={canWrite ? openCreate : undefined} variant="primary" disabled={!canWrite}>
                  <Plus className="h-4 w-4" />
                  Tambah Tarif
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-neutral-soft">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Nomor
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Tipe
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Cold Storage
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Tarif/kg/hari
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Min. Qty
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Diskon
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Berlaku
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((rate) => (
                    <tr
                      key={rate.id}
                      className="group transition-colors odd:bg-white even:bg-[#fafcfc] hover:bg-primary/[0.03]"
                    >
                      <td className="px-4 py-3 text-sm font-mono text-primary">
                        {rate.rate_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink">
                        {RATE_TYPE_LABELS[rate.rate_type] ?? rate.rate_type}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink">
                        {rate.customer?.name ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink">
                        {rate.cold_storage?.name ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular text-ink">
                        {formatCurrency(rate.rate_per_kg_day)}/kg
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular text-ink">
                        {rate.minimum_quantity_kg
                          ? `${rate.minimum_quantity_kg.toLocaleString("id-ID")} kg`
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular text-ink">
                        {rate.discount_percentage > 0 ? (
                          <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                            {rate.discount_percentage}%
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(rate.effective_from).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                        {rate.effective_to && (
                          <> — {new Date(rate.effective_to).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={STATUS_TONE[rate.status] ?? "neutral"}>
                          {rate.status === "ACTIVE" ? "Aktif" : rate.status === "PENDING_APPROVAL" ? "Menunggu" : "Nonaktif"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => canWrite ? openEdit(rate) : undefined}
                            className={`rounded-lg p-1.5 transition-colors ${canWrite ? "text-slate-400 hover:bg-slate-100 hover:text-primary cursor-pointer" : "text-slate-200 cursor-default"}`}
                            title={canWrite ? "Edit" : "Tidak ada izin"}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => canWrite ? setDeleteTarget(rate) : undefined}
                            className={`rounded-lg p-1.5 transition-colors ${canWrite ? "text-slate-400 hover:bg-red-50 hover:text-danger cursor-pointer" : "text-slate-200 cursor-default"}`}
                            title={canWrite ? "Nonaktifkan" : "Tidak ada izin"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create / Edit Modal */}
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editRate ? "Edit Tarif Sewa" : "Tambah Tarif Sewa"}
          description="Harga sudah termasuk PPN, listrik, jasa, maintenance &amp; kebersihan. Diskon di atas 10% memerlukan persetujuan Director."
          size="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Tipe */}
            <Select
              label="Tipe Tarif"
              options={[
                { value: "STANDARD", label: "Standar" },
                { value: "CUSTOMER", label: "Per Customer" },
                { value: "STORAGE", label: "Per Cold Storage" },
                { value: "LOCATION", label: "Per Lokasi" },
                { value: "CATEGORY", label: "Per Kategori" },
                { value: "PRODUCT", label: "Per Produk" },
              ]}
              value={form.rate_type}
              onChange={(e) => setForm((f) => ({ ...f, rate_type: e.target.value }))}
              required
            />

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Customer */}
              <Select
                label="Customer (opsional)"
                options={[{ value: "", label: "— Tidak ada —" }, ...customers]}
                value={form.customer_id}
                onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
              />
              {/* Cold Storage */}
              <Select
                label="Cold Storage (opsional)"
                options={[{ value: "", label: "— Tidak ada —" }, ...coldStorages]}
                value={form.cold_storage_id}
                onChange={(e) => handleColdStorageChange(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Storage Location */}
              <Select
                label="Lokasi Penyimpanan (opsional)"
                options={[{ value: "", label: "— Tidak ada —" }, ...filteredLocations]}
                value={form.storage_location_id}
                onChange={(e) => setForm((f) => ({ ...f, storage_location_id: e.target.value }))}
              />
              {/* Product Category */}
              <Select
                label="Kategori Produk (opsional)"
                options={[{ value: "", label: "— Tidak ada —" }, ...productCategories]}
                value={form.product_category_id}
                onChange={(e) => handleCategoryChange(e.target.value)}
              />
            </div>

            {/* Product */}
            <Select
              label="Produk (opsional)"
              options={[{ value: "", label: "— Tidak ada —" }, ...filteredProducts]}
              value={form.product_id}
              onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Rate */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Tarif per kg/hari <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.rate_per_kg_day}
                    onChange={(e) => setForm((f) => ({ ...f, rate_per_kg_day: e.target.value }))}
                    className="app-surface w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                    placeholder="0.00"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    IDR/kg
                  </span>
                </div>
              </div>
              {/* Min qty */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Min. Kuantitas (kg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.minimum_quantity_kg}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, minimum_quantity_kg: e.target.value }))
                  }
                  className="app-surface w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                  placeholder="0"
                />
              </div>
              {/* Min days */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Min. Hari
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.minimum_days}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, minimum_days: e.target.value }))
                  }
                  className="app-surface w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                  placeholder="1"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Discount */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Diskon (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.discount_percentage}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discount_percentage: e.target.value }))
                  }
                  className="app-surface w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                />
                {parseFloat(form.discount_percentage) > 10 && (
                  <p className="mt-1 text-xs text-warning">
                    ⚠ Diskon di atas 10% memerlukan persetujuan Director.
                  </p>
                )}
              </div>
              {/* Status */}
              <Select
                label="Status"
                options={[
                  { value: "ACTIVE", label: "Aktif" },
                  { value: "PENDING_APPROVAL", label: "Menunggu Persetujuan" },
                  { value: "INACTIVE", label: "Tidak Aktif" },
                ]}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Effective from */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Berlaku Dari <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.effective_from}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, effective_from: e.target.value }))
                  }
                  className="app-surface w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                />
              </div>
              {/* Effective to */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Berlaku Sampai
                </label>
                <input
                  type="date"
                  value={form.effective_to}
                  onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
                  className="app-surface w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Catatan</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="app-surface w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/10"
                placeholder="Opsional..."
              />
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {editRate ? "Simpan Perubahan" : "Tambah Tarif"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirmation */}
        <Modal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Nonaktifkan Tarif Sewa"
          description={`Nonaktifkan tarif ${deleteTarget?.rate_number}? Tarif tidak akan berlaku lagi, tetapi data historis tetap disimpan.`}
          size="sm"
        >
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Nonaktifkan
            </Button>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}