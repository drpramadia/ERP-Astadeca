"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

type FieldType = "text" | "email" | "number" | "textarea" | "select" | "checkbox";

interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: { value: string; label: string }[];
  optionSource?: "categories" | "units" | "warehouses" | "coldStorages" | "businessUnits";
}

interface ResourceDefinition {
  title: string;
  description: string;
  table: string;
  primaryField: string;
  secondaryField?: string;
  statusField: "active" | "status";
  statusActiveValue?: string;
  fields: FieldDefinition[];
}

type MasterRow = Record<string, unknown> & { id: string; organization_id: string };
type ReferenceOption = { id: string; code: string; name: string };

const resourceDefinitions: Record<string, ResourceDefinition> = {
  products: {
    title: "Produk",
    description: "SKU, kategori, satuan, harga, dan pelacakan stok.",
    table: "products",
    primaryField: "name",
    secondaryField: "sku",
    statusField: "active",
    fields: [
      { name: "sku", label: "SKU", type: "text", required: true },
      { name: "name", label: "Nama produk", type: "text", required: true },
      { name: "category_id", label: "Kategori", type: "select", optionSource: "categories" },
      { name: "unit_id", label: "Satuan", type: "select", optionSource: "units" },
      { name: "brand", label: "Merek", type: "text" },
      { name: "description", label: "Deskripsi", type: "textarea" },
      { name: "purchase_price", label: "Harga beli", type: "number", defaultValue: 0 },
      { name: "selling_price", label: "Harga jual", type: "number", defaultValue: 0 },
      { name: "min_stock", label: "Stok minimum", type: "number", defaultValue: 0 },
      { name: "max_stock", label: "Stok maksimum", type: "number" },
      { name: "track_batch", label: "Lacak batch", type: "checkbox", defaultValue: true },
      { name: "track_expiry", label: "Lacak kedaluwarsa", type: "checkbox", defaultValue: true },
    ],
  },
  categories: {
    title: "Kategori Produk",
    description: "Kelola klasifikasi produk yang dipakai pada transaksi.",
    table: "product_categories",
    primaryField: "name",
    secondaryField: "code",
    statusField: "active",
    fields: [
      { name: "code", label: "Kode", type: "text", required: true },
      { name: "name", label: "Nama kategori", type: "text", required: true },
      { name: "description", label: "Deskripsi", type: "textarea" },
    ],
  },
  units: {
    title: "Satuan",
    description: "Kelola satuan produk dan konversi yang digunakan operasional.",
    table: "units",
    primaryField: "name",
    secondaryField: "code",
    statusField: "active",
    fields: [
      { name: "code", label: "Kode", type: "text", required: true },
      { name: "name", label: "Nama satuan", type: "text", required: true },
      { name: "description", label: "Deskripsi", type: "textarea" },
    ],
  },
  suppliers: {
    title: "Supplier",
    description: "Kelola pemasok tanpa menghapus riwayat transaksi.",
    table: "suppliers",
    primaryField: "name",
    secondaryField: "code",
    statusField: "active",
    fields: [
      { name: "code", label: "Kode", type: "text", required: true },
      { name: "name", label: "Nama supplier", type: "text", required: true },
      { name: "supplier_type", label: "Tipe supplier", type: "text" },
      { name: "contact_person", label: "Kontak", type: "text" },
      { name: "phone", label: "Telepon", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "tax_id", label: "NPWP", type: "text" },
      { name: "address", label: "Alamat", type: "textarea" },
      { name: "payment_terms_days", label: "Termin (hari)", type: "number", defaultValue: 0 },
    ],
  },
  customers: {
    title: "Customer",
    description: "Kelola customer supply chain dan rental.",
    table: "customers",
    primaryField: "name",
    secondaryField: "code",
    statusField: "active",
    fields: [
      { name: "code", label: "Kode", type: "text", required: true },
      { name: "name", label: "Nama customer", type: "text", required: true },
      { name: "customer_type", label: "Tipe customer", type: "text" },
      { name: "contact_person", label: "Kontak", type: "text" },
      { name: "phone", label: "Telepon", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "tax_id", label: "NPWP", type: "text" },
      { name: "address", label: "Alamat", type: "textarea" },
      { name: "payment_terms_days", label: "Termin (hari)", type: "number", defaultValue: 0 },
      { name: "is_supply_chain_customer", label: "Customer supply chain", type: "checkbox", defaultValue: true },
      { name: "is_rental_customer", label: "Customer rental", type: "checkbox", defaultValue: false },
    ],
  },
  warehouses: {
    title: "Warehouse",
    description: "Kelola warehouse dan unit bisnis terkait.",
    table: "warehouses",
    primaryField: "name",
    secondaryField: "code",
    statusField: "active",
    fields: [
      { name: "code", label: "Kode", type: "text", required: true },
      { name: "name", label: "Nama warehouse", type: "text", required: true },
      { name: "business_unit_id", label: "Business unit", type: "select", optionSource: "businessUnits" },
      { name: "warehouse_type", label: "Tipe", type: "select", defaultValue: "COLD_STORAGE", options: [
        { value: "COLD_STORAGE", label: "Cold storage" }, { value: "DRY_STORAGE", label: "Dry storage" },
        { value: "STAGING", label: "Staging" }, { value: "QUARANTINE", label: "Quarantine" },
        { value: "OTHER", label: "Lainnya" },
      ] },
      { name: "address", label: "Alamat", type: "textarea" },
      { name: "description", label: "Deskripsi", type: "textarea" },
    ],
  },
  "cold-storage": {
    title: "Cold Storage",
    description: "Kelola kapasitas dan rentang suhu penyimpanan.",
    table: "cold_storages",
    primaryField: "name",
    secondaryField: "code",
    statusField: "status",
    statusActiveValue: "ACTIVE",
    fields: [
      { name: "code", label: "Kode", type: "text", required: true },
      { name: "name", label: "Nama cold storage", type: "text", required: true },
      { name: "warehouse_id", label: "Warehouse", type: "select", optionSource: "warehouses", required: true },
      { name: "capacity_kg", label: "Kapasitas (KG)", type: "number", required: true },
      { name: "temperature_min_c", label: "Suhu minimum (C)", type: "number" },
      { name: "temperature_max_c", label: "Suhu maksimum (C)", type: "number" },
      { name: "status", label: "Status", type: "select", defaultValue: "ACTIVE", options: [
        { value: "ACTIVE", label: "Aktif" }, { value: "MAINTENANCE", label: "Maintenance" },
        { value: "INACTIVE", label: "Nonaktif" },
      ] },
      { name: "description", label: "Deskripsi", type: "textarea" },
    ],
  },
  locations: {
    title: "Lokasi Penyimpanan",
    description: "Kelola lokasi rinci di setiap cold storage.",
    table: "storage_locations",
    primaryField: "name",
    secondaryField: "code",
    statusField: "active",
    fields: [
      { name: "cold_storage_id", label: "Cold storage", type: "select", optionSource: "coldStorages", required: true },
      { name: "code", label: "Kode lokasi", type: "text", required: true },
      { name: "name", label: "Nama lokasi", type: "text", required: true },
      { name: "aisle", label: "Lorong", type: "text" },
      { name: "rack", label: "Rak", type: "text" },
      { name: "level", label: "Level", type: "text" },
      { name: "capacity_kg", label: "Kapasitas (KG)", type: "number", defaultValue: 0 },
    ],
  },
};

const referenceTables = [
  ["categories", "product_categories"], ["units", "units"], ["warehouses", "warehouses"],
  ["coldStorages", "cold_storages"], ["businessUnits", "business_units"],
] as const;

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return String(value);
}

export function MasterDataClient({ resource }: { resource: string }) {
  const definition = resourceDefinitions[resource];
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [options, setOptions] = useState<Record<string, ReferenceOption[]>>({});
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Record<string, string | number | boolean>>({});
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [details, setDetails] = useState<MasterRow | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!definition) {
        setError("Master data tidak ditemukan.");
        setIsLoading(false);
        return;
      }
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getClaims();
        const userId = claimsData?.claims?.sub;
        if (!userId) throw new Error("Silakan login untuk mengelola master data.");
        const { data: membership, error: membershipError } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");

        const [masterResult, ...referenceResults] = await Promise.all([
          supabase.from(definition.table).select("*").eq("organization_id", membership.organization_id).order(definition.primaryField),
          ...referenceTables.map(([, table]) => supabase.from(table).select("id, code, name").eq("organization_id", membership.organization_id).order("name")),
        ]);
        if (masterResult.error) throw masterResult.error;
        const nextOptions: Record<string, ReferenceOption[]> = {};
        referenceTables.forEach(([key], index) => {
          const result = referenceResults[index];
          nextOptions[key] = (result.data || []) as ReferenceOption[];
        });
        if (!cancelled) {
          setOrganizationId(membership.organization_id);
          setRows((masterResult.data || []) as MasterRow[]);
          setOptions(nextOptions);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat master data.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [definition]);

  if (!definition) {
    return <AppShell><p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Master data tidak ditemukan.</p></AppShell>;
  }

  function openCreate() {
    setEditing(null);
    setForm(Object.fromEntries(definition.fields.map((field) => [field.name, field.defaultValue ?? (field.type === "checkbox" ? false : "")])));
    setError(null);
    setIsEditorOpen(true);
  }

  function openEdit(row: MasterRow) {
    setEditing(row);
    setForm(Object.fromEntries(definition.fields.map((field) => [field.name, (row[field.name] as string | number | boolean | null) ?? field.defaultValue ?? (field.type === "checkbox" ? false : "")])));
    setError(null);
    setIsEditorOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setIsSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const field of definition.fields) {
      const value = form[field.name];
      if (field.required && (value === "" || value === null || value === undefined)) {
        setError(`${field.label} wajib diisi.`);
        setIsSaving(false);
        return;
      }
      payload[field.name] = field.type === "checkbox"
        ? Boolean(value)
        : field.type === "number"
          ? value === "" ? null : Number(value)
          : value === "" ? null : value;
    }

    try {
      const supabase = createClient();
      const result = editing
        ? await supabase.from(definition.table).update(payload).eq("id", editing.id).eq("organization_id", organizationId).select("*").single()
        : await supabase.from(definition.table).insert({ ...payload, organization_id: organizationId }).select("*").single();
      if (result.error) throw result.error;
      setRows((current) => editing
        ? current.map((row) => row.id === editing.id ? result.data as MasterRow : row)
        : [result.data as MasterRow, ...current]);
      setIsEditorOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan master data.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivate(row: MasterRow) {
    if (!organizationId || !window.confirm(`Nonaktifkan ${String(row[definition.primaryField] || "record ini")}?`)) return;
    setError(null);
    const statusValue = definition.statusField === "active" ? false : "INACTIVE";
    const { data, error: updateError } = await createClient()
      .from(definition.table)
      .update({ [definition.statusField]: statusValue })
      .eq("id", row.id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows((current) => current.map((item) => item.id === row.id ? data as MasterRow : item));
  }

  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return !query || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query));
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="MASTER DATA"
          title={definition.title}
          description={definition.description}
          actions={<Button onClick={openCreate}>Tambah {definition.title}</Button>}
        />
        <nav aria-label="Master data" className="mb-5 flex gap-5 overflow-x-auto border-b border-line">
          {Object.entries(resourceDefinitions).map(([key, item]) => (
            <Link
              key={key}
              href={`/master-data/${key}`}
              aria-current={resource === key ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${resource === key ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-ink"}`}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <Input aria-label={`Cari ${definition.title}`} placeholder="Cari kode atau nama" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-sm" />
          <span className="ml-auto text-sm text-slate-500">{filteredRows.length} record</span>
        </div>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">Memuat {definition.title.toLowerCase()}...</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-slate-500">Belum ada data yang cocok.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                <th className="px-4 py-3">{definition.secondaryField || "Nama"}</th>
                <th className="px-4 py-3">{definition.primaryField}</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {filteredRows.map((row) => {
                  const status = row[definition.statusField];
                  const active = definition.statusField === "active" ? status === true : status === (definition.statusActiveValue || "ACTIVE");
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-ink">{displayValue(definition.secondaryField ? row[definition.secondaryField] : row.id)}</td>
                      <td className="px-4 py-3 text-sm text-ink">{displayValue(row[definition.primaryField])}</td>
                      <td className="px-4 py-3 text-sm"><span className={active ? "text-emerald-700" : "text-slate-500"}>{active ? "Aktif" : displayValue(status)}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setDetails(row)}>Detail</Button>
                          <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
                          {active && <Button size="sm" variant="danger" onClick={() => void deactivate(row)}>Nonaktifkan</Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} title={editing ? `Edit ${definition.title}` : `Tambah ${definition.title}`} size="lg">
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {definition.fields.map((field) => {
              if (field.type === "checkbox") {
                return <label key={field.name} className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={Boolean(form[field.name])} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.checked }))} />{field.label}</label>;
              }
              if (field.type === "textarea") {
                return <div key={field.name} className="sm:col-span-2"><Textarea label={field.label} required={field.required} value={String(form[field.name] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} /></div>;
              }
              if (field.type === "select") {
                const sourceOptions = field.optionSource ? (options[field.optionSource] || []).map((option) => ({ value: option.id, label: `${option.code} · ${option.name}` })) : [];
                return <Select key={field.name} label={field.label} required={field.required} options={[{ value: "", label: "Pilih..." }, ...(field.options || sourceOptions)]} value={String(form[field.name] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />;
              }
              return <Input key={field.name} label={field.label} type={field.type} required={field.required} min={field.type === "number" ? "0" : undefined} step={field.type === "number" ? "any" : undefined} value={String(form[field.name] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />;
            })}
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsEditorOpen(false)}>Batal</Button>
            <Button type="submit" loading={isSaving}>{editing ? "Simpan perubahan" : "Buat data"}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={details !== null} onClose={() => setDetails(null)} title={`Detail ${definition.title}`} size="lg">
        {details && <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(details).filter(([key]) => !["id", "organization_id"].includes(key)).map(([key, value]) => <div key={key} className="border-b border-line pb-2"><dt className="text-xs text-slate-500">{key.replaceAll("_", " ")}</dt><dd className="mt-1 break-words text-sm text-ink">{displayValue(value)}</dd></div>)}</dl>}
      </Modal>
    </AppShell>
  );
}