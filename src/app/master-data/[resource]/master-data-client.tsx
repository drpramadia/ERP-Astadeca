"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";

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

// ============================================
// CSV: template, export, import
// ============================================

/**
 * Template headers are the field names, because import matches on them. Row 1 is
 * the machine-readable header, row 2 restates each column in Indonesian so the
 * sheet is usable in Excel.
 */
function buildTemplate(definition: ResourceDefinition, options: Record<string, ReferenceOption[]>, template: boolean): string {
  const headers = definition.fields.map((field) => field.name);
  const labels = definition.fields.map((field) => field.label);
  return toCsv(headers, template ? [labels, templateHintRow(definition, options)] : [labels]);
}

/**
 * The template's explanatory row. Import compares the first data row against
 * this exact row and drops it when it matches, so a filled-in template uploads
 * without the user having to delete the explanation — while an exported sheet
 * never matches and keeps every record.
 */
function templateHintRow(definition: ResourceDefinition, options: Record<string, ReferenceOption[]>): string[] {
  return definition.fields.map((field) => {
    if (field.type === "checkbox") return "true / false";
    if (field.type === "number") return "angka";
    if (field.type === "select" && field.optionSource) {
      const codes = (options[field.optionSource] || []).map((option) => option.code);
      return codes.length ? `kode: ${codes.join(" | ")} : `kode ${field.optionSource};
    }
    if (field.type === "email") return "email";
    return field.required ? "wajib diisi" : "opsional";
  });
}

/** Whether a row counts as active, per the resource's status strategy. */
function isRowActive(definition: ResourceDefinition, row: MasterRow): boolean {
  const status = row[definition.statusField];
  return definition.statusField === "active" ? status === true : status === (definition.statusActiveValue || "ACTIVE");
}

/** A row's values as CSV cells: booleans as true/false, references as codes. */
function rowToCells(
  definition: ResourceDefinition,
  row: MasterRow,
  options: Record<string, ReferenceOption[]>,
): string[] {
  return definition.fields.map((field) => {
    const value = row[field.name];
    if (field.type === "select" && field.optionSource) {
      const pool = options[field.optionSource] || [];
      const match = pool.find((option) => option.id === value);
      return match ? match.code : value === null || value === undefined ? "" : String(value);
    }
    if (field.type === "checkbox") return value === true ? "true" : value === false ? "false" : "";
    return value === null || value === undefined ? "" : String(value);
  });
}

/**
 * Resolves one imported cell. Reference columns accept the referenced record's
 * code (what the template lists), its name, or a raw UUID, so a sheet exported
 * from this page can be re-imported unchanged.
 */
function resolveCell(
  definition: ResourceDefinition,
  field: FieldDefinition,
  raw: string,
  options: Record<string, ReferenceOption[]>,
): { value: unknown; error?: string } {
  const text = raw.trim();

  if (field.type === "checkbox") {
    if (text === "") return { value: field.defaultValue ?? false };
    const lowered = text.toLowerCase();
    if (["true", "ya", "1", "y"].includes(lowered)) return { value: true };
    if (["false", "tidak", "0", "n"].includes(lowered)) return { value: false };
    return { value: null, error: `${field.label}: nilai "${text}" bukan true/false.` };
  }

  if (field.type === "select" && field.optionSource) {
    if (text === "") {
      if (field.required) return { value: null, error: `${field.label} wajib diisi.` };
      return { value: null };
    }
    const pool = options[field.optionSource] || [];
    const match = pool.find((option) => option.code.toLowerCase() === text.toLowerCase())
      || pool.find((option) => option.name.toLowerCase() === text.toLowerCase())
      || pool.find((option) => option.id === text);
    if (!match) {
      return { value: null, error: `${field.label}: "${text}" tidak cocok dengan ${field.optionSource}.` };
    }
    return { value: match.id };
  }

  if (field.type === "number") {
    if (text === "") {
      if (field.required) return { value: null, error: `${field.label} wajib diisi.` };
      return { value: null };
    }
    const parsed = Number(text);
    if (Number.isNaN(parsed)) return { value: null, error: `${field.label}: "${text}" bukan angka.` };
    return { value: parsed };
  }

  if (text === "" || text === "-") {
    if (field.required) return { value: null, error: `${field.label} wajib diisi.` };
    return { value: null };
  }
  return { value: text };
}

interface ImportIssue { line: number; message: string }

function importFilename(definition: ResourceDefinition): string {
  return `template-${definition.table}.csv`;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, unknown>[] | null>(null);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MasterRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error("Silakan login untuk mengelola master data.");
        const { data: membership, error: membershipError } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", userId)
          .eq("is_active", "true")
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

  /** The value written to the status column for a desired active state. */
  function statusValueFor(active: boolean): boolean | string {
    if (definition.statusField === "active") return active;
    return active ? (definition.statusActiveValue || "ACTIVE") : "INACTIVE";
  }

  /** Active <-> inactive, without deleting the record or its history. */
  async function toggleActive(row: MasterRow) {
    if (!organizationId) return;
    const next = !isRowActive(definition, row);
    setError(null);
    const { data, error: updateError } = await createClient()
      .from(definition.table)
      .update({ [definition.statusField]: statusValueFor(next) })
      .eq("id", row.id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows((current) => current.map((item) => item.id === row.id ? data as MasterRow : item));
    setNotice(`${displayValue(row[definition.primaryField])} ${next ? "diaktifkan" : "dinonaktifkan"}.`);
  }

  /** Hard delete. Records still referenced by transactions are refused by the
   *  foreign keys, so the failure is surfaced with a pointer to deactivate. */
  async function removeRow(row: MasterRow) {
    if (!organizationId) return;
    setError(null);
    setIsBulkBusy(true);
    const { error: deleteError } = await createClient()
      .from(definition.table)
      .delete()
      .eq("id", row.id)
      .eq("organization_id", organizationId);
    setIsBulkBusy(false);
    setConfirmDelete(null);
    if (deleteError) {
      setError(`Gagal menghapus: ${deleteError.message}. Jika data ini sudah dipakai transaksi, gunakan Nonaktifkan.`);
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(row.id);
      return next;
    });
    setNotice(`${displayValue(row[definition.primaryField])} dihapus permanen.`);
  }

  async function bulkSetActive(active: boolean) {
    if (!organizationId || selected.size === 0) return;
    setIsBulkBusy(true);
    setError(null);
    const ids = Array.from(selected);
    const { data, error: updateError } = await createClient()
      .from(definition.table)
      .update({ [definition.statusField]: statusValueFor(active) })
      .in("id", ids)
      .eq("organization_id", organizationId)
      .select("*");
    setIsBulkBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const updated = (data || []) as MasterRow[];
    setRows((current) => current.map((item) => updated.find((entry) => entry.id === item.id) ?? item));
    setSelected(new Set());
    setNotice(`${updated.length} data di${active ? "aktifkan" : "nonaktifkan"}.`);
  }

  async function bulkDelete() {
    if (!organizationId || selected.size === 0) return;
    const ids = Array.from(selected);
    if (!window.confirm(`Hapus permanen ${ids.length} data terpilih? Tindakan ini tidak dapat dibatalkan.`)) return;
    setIsBulkBusy(true);
    setError(null);
    const { error: deleteError } = await createClient()
      .from(definition.table)
      .delete()
      .in("id", ids)
      .eq("organization_id", organizationId);
    setIsBulkBusy(false);
    if (deleteError) {
      setError(`Gagal menghapus: ${deleteError.message}. Jika data sudah dipakai transaksi, gunakan Nonaktifkan.`);
      return;
    }
    setRows((current) => current.filter((item) => !ids.includes(item.id)));
    setSelected(new Set());
    setNotice(`${ids.length} data dihapus permanen.`);
  }

  function downloadTemplate() {
    setError(null);
    downloadCsv(importFilename(definition), buildTemplate(definition, options, true));
  }

  function exportRows() {
    setError(null);
    const headers = definition.fields.map((field) => field.name);
    const labels = definition.fields.map((field) => field.label);
    // Row 2 is the label row, never the template's hint row, so re-importing an
    // exported file keeps every record instead of skipping the first one.
    downloadCsv(`master-${definition.table}.csv`, toCsv(headers, [
      labels,
      ...rows.map((row) => rowToCells(definition, row, options)),
    ]));
  }

  function openImportPicker() {
    setError(null);
    setImportIssues([]);
    setImportRows(null);
    fileInputRef.current?.click();
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);

    const table = parseCsv(await file.text());
    if (table.length < 2) {
      setError("File CSV kosong atau tidak memiliki baris data.");
      return;
    }

    const headers = table[0].map((header) => header.trim());
    const missing = definition.fields.filter((field) => field.required && !headers.includes(field.name));
    if (missing.length > 0) {
      setError(`Kolom wajib tidak ditemukan: ${missing.map((field) => `${field.name} (${field.label})`).join(", ")}. Unduh template terbaru dan isi sesuai kolomnya.`);
      return;
    }

    // A file produced by this page leads with explanation rows, not records:
    // the label row (template and export) and the template's hint row. Any
    // leading row that repeats one of them is dropped, so a template can be
    // filled in and uploaded as-is. Rows further down are never skipped, so a
    // record whose value happens to equal a label is still imported.
    const explanationRows = new Set([
      definition.fields.map((field) => field.label).join("\u0001"),
      templateHintRow(definition, options).join("\u0001"),
    ]);
    let dataLines = table.slice(1);
    let firstLineNumber = 2;
    while (dataLines.length > 0 && explanationRows.has(dataLines[0].join("\u0001"))) {
      dataLines = dataLines.slice(1);
      firstLineNumber += 1;
    }

    const parsed: Record<string, unknown>[] = [];
    const issues: ImportIssue[] = [];
    dataLines.forEach((line, index) => {
      const record: Record<string, unknown> = {};
      const rowErrors: string[] = [];
      for (const field of definition.fields) {
        const columnIndex = headers.indexOf(field.name);
        const result = resolveCell(definition, field, columnIndex === -1 ? "" : (line[columnIndex] ?? ""), options);
        if (result.error) rowErrors.push(result.error);
        else record[field.name] = result.value;
      }
      if (rowErrors.length > 0) issues.push({ line: index + firstLineNumber, message: rowErrors.join(" ") });
      else parsed.push(record);
    });

    setImportIssues(issues);
    if (parsed.length === 0) {
      setError(`Tidak ada baris yang valid.${issues[0] ? ` Baris ${issues[0].line}: ${issues[0].message} : ""}`);
      return;
    }
    setImportRows(parsed);
  }

  async function runImport() {
    if (!organizationId || !importRows) return;
    setIsImporting(true);
    setError(null);
    const { data, error: insertError } = await createClient()
      .from(definition.table)
      .insert(importRows.map((record) => ({ ...record, organization_id: organizationId })))
      .select("*");
    setIsImporting(false);
    if (insertError) {
      setError(`Impor gagal: ${insertError.message});
      return;
    }
    const inserted = (data || []) as MasterRow[];
    setRows((current) => [...inserted, ...current]);
    setNotice(`${inserted.length} data berhasil diimpor.`);
    setImportRows(null);
    setImportIssues([]);
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
              href={`/master-data/${key}}
              aria-current={resource === key ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${resource === key ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-ink"}}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
        <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <Input aria-label={`Cari ${definition.title}} placeholder="Cari kode atau nama" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-sm" />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={downloadTemplate}>Unduh template CSV</Button>
            <Button size="sm" variant="secondary" onClick={exportRows} disabled={rows.length === 0}>Ekspor CSV</Button>
            <Button size="sm" variant="secondary" onClick={openImportPicker}>Impor CSV</Button>
            <span className="text-sm text-slate-500">{filteredRows.length} record</span>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void handleImportFile(event)} />
        </div>
        {selected.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium text-ink">{selected.size} data dipilih</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={isBulkBusy} onClick={() => void bulkSetActive(true)}>Aktifkan</Button>
              <Button size="sm" variant="secondary" disabled={isBulkBusy} onClick={() => void bulkSetActive(false)}>Nonaktifkan</Button>
              <Button size="sm" variant="danger" disabled={isBulkBusy} onClick={() => void bulkDelete()}>Hapus</Button>
              <Button size="sm" variant="ghost" disabled={isBulkBusy} onClick={() => setSelected(new Set())}>Batal pilih</Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">Memuat {definition.title.toLowerCase()}...</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-slate-500">Belum ada data yang cocok.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Pilih semua ${definition.title}}
                    checked={filteredRows.length > 0 && filteredRows.every((row) => selected.has(row.id))}
                    onChange={(event) => setSelected(event.target.checked ? new Set(filteredRows.map((row) => row.id)) : new Set())}
                  />
                </th>
                <th className="px-4 py-3">{definition.secondaryField || "Nama"}</th>
                <th className="px-4 py-3">{definition.primaryField}</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {filteredRows.map((row) => {
                  const active = isRowActive(definition, row);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${displayValue(row[definition.primaryField])}}
                          checked={selected.has(row.id)}
                          onChange={(event) => setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-ink">{displayValue(definition.secondaryField ? row[definition.secondaryField] : row.id)}</td>
                      <td className="px-4 py-3 text-sm text-ink">{displayValue(row[definition.primaryField])}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={active ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"}>
                          {active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setDetails(row)}>Detail</Button>
                          <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
                          <Button size="sm" variant="secondary" disabled={isBulkBusy} onClick={() => void toggleActive(row)}>
                            {active ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                          <Button size="sm" variant="danger" disabled={isBulkBusy} onClick={() => setConfirmDelete(row)}>Hapus</Button>
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

      <Modal isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} title={editing ? `Edit ${definition.title} : `Tambah ${definition.title}} size="lg">
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
                const sourceOptions = field.optionSource ? (options[field.optionSource] || []).map((option) => ({ value: option.id, label: `${option.code} · ${option.name} })) : [];
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

      <Modal isOpen={details !== null} onClose={() => setDetails(null)} title={`Detail ${definition.title}} size="lg">
        {details && <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(details).filter(([key]) => !["id", "organization_id"].includes(key)).map(([key, value]) => <div key={key} className="border-b border-line pb-2"><dt className="text-xs text-slate-500">{key.replaceAll("_", " ")}</dt><dd className="mt-1 break-words text-sm text-ink">{displayValue(value)}</dd></div>)}</dl>}
      </Modal>

      <Modal isOpen={importRows !== null} onClose={() => { setImportRows(null); setImportIssues([]); }} title={`Pratinjau impor ${definition.title}} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-ink">
            <strong>{importRows?.length ?? 0} baris</strong> siap diimpor.
            {importIssues.length > 0 && <> {importIssues.length} baris dilewati karena tidak valid.</>}
          </p>
          {importIssues.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase text-amber-800">Baris dilewati</p>
              <ul className="space-y-1 text-xs text-amber-900">
                {importIssues.slice(0, 30).map((issue) => <li key={issue.line}>Baris {issue.line}: {issue.message}</li>)}
              </ul>
            </div>
          )}
          <div className="max-h-64 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>{definition.fields.map((field) => <th key={field.name} className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600">{field.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(importRows || []).slice(0, 20).map((record, index) => (
                  <tr key={index}>{definition.fields.map((field) => <td key={field.name} className="whitespace-nowrap px-3 py-2 text-ink">{displayValue(record[field.name])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {(importRows?.length ?? 0) > 20 && <p className="text-xs text-slate-500">Menampilkan 20 baris pertama dari {importRows?.length} data.</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={() => { setImportRows(null); setImportIssues([]); }}>Batal</Button>
            <Button type="button" loading={isImporting} onClick={() => void runImport()}>Impor {importRows?.length ?? 0} data</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={`Hapus ${definition.title}}>
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              Hapus permanen <strong>{displayValue(confirmDelete[definition.primaryField])}</strong>?
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Jika data ini sudah dipakai transaksi, penghapusan akan ditolak. Gunakan <strong>Nonaktifkan</strong> agar riwayat tetap utuh.
            </p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(null)}>Batal</Button>
              <Button type="button" variant="danger" loading={isBulkBusy} onClick={() => void removeRow(confirmDelete)}>Hapus permanen</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}