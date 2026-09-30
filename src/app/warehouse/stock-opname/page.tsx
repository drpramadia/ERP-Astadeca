"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/utils";

interface Option {
  id: string;
  code: string;
  name: string;
  warehouse_id?: string;
}

interface Opname {
  id: string;
  opname_number: string;
  status: string;
  planned_date: string;
  notes: string | null;
  cold_storages: { code: string; name: string } | null;
}

interface OpnameItem {
  id: string;
  inventory_id: string;
  planned_quantity: number;
  planned_quantity_kg: number | null;
  counted_quantity: number | null;
  counted_quantity_kg: number | null;
  variance_quantity: number | null;
  variance_reason: string | null;
  photo_url: string | null;
  products: { name: string; sku: string } | null;
  batches: { batch_number: string } | null;
  storage_locations: { code: string } | null;
}

interface CountInput {
  quantity: string;
  quantityKg: string;
  reason: string;
  photoUrl: string;
}

const varianceReasons = ["COUNT_DIFFERENCE", "DAMAGE", "EXPIRY", "WEIGHT_LOSS", "OTHER"];

export default function StockOpnamePage() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [coldStorages, setColdStorages] = useState<Option[]>([]);
  const [opnames, setOpnames] = useState<Opname[]>([]);
  const [selected, setSelected] = useState<Opname | null>(null);
  const [items, setItems] = useState<OpnameItem[]>([]);
  const [counts, setCounts] = useState<Record<string, CountInput>>({});
  const [warehouseId, setWarehouseId] = useState("");
  const [coldStorageId, setColdStorageId] = useState("");
  const [plannedDate, setPlannedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadOpnames(orgId: string) {
    const { data, error: queryError } = await createClient().from("stock_opnames").select("id, opname_number, status, planned_date, notes, cold_storages(code, name)").eq("organization_id", orgId).order("created_at", { ascending: false });
    if (queryError) throw queryError;
    setOpnames((data || []) as unknown as Opname[]);
  }

  async function loadItems(opnameId: string) {
    const { data, error: queryError } = await createClient().from("stock_opname_items").select("id, inventory_id, planned_quantity, planned_quantity_kg, counted_quantity, counted_quantity_kg, variance_quantity, variance_reason, photo_url, products(name, sku), batches(batch_number), storage_locations(code)").eq("opname_id", opnameId).order("created_at");
    if (queryError) throw queryError;
    const loadedItems = (data || []) as unknown as OpnameItem[];
    setItems(loadedItems);
    setCounts(Object.fromEntries(loadedItems.map((item) => [item.id, {
      quantity: item.counted_quantity === null ? "" : String(item.counted_quantity),
      quantityKg: item.counted_quantity_kg === null ? "" : String(item.counted_quantity_kg),
      reason: item.variance_reason || "",
      photoUrl: item.photo_url || "",
    }])));
  }

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error("Silakan login untuk membuka stock opname.");
        const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("is_active", "true").maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        const [warehouseResult, storageResult] = await Promise.all([
          supabase.from("warehouses").select("id, code, name").eq("organization_id", membership.organization_id).eq("active", true).order("name"),
          supabase.from("cold_storages").select("id, code, name, warehouse_id").eq("organization_id", membership.organization_id).eq("status", "ACTIVE").order("code"),
        ]);
        if (warehouseResult.error) throw warehouseResult.error;
        if (storageResult.error) throw storageResult.error;
        setOrganizationId(membership.organization_id);
        setActorId(userId);
        setWarehouses((warehouseResult.data || []) as Option[]);
        setColdStorages((storageResult.data || []) as Option[]);
        await loadOpnames(membership.organization_id);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat stock opname.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  async function createOpname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !actorId || !warehouseId) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: createError } = await createClient().rpc("create_stock_opname", {
        p_organization_id: organizationId,
        p_warehouse_id: warehouseId,
        p_cold_storage_id: coldStorageId || null,
        p_planned_date: plannedDate,
        p_notes: notes || null,
        p_performed_by: actorId,
      });
      if (createError) throw createError;
      await loadOpnames(organizationId);
      const created = (await createClient().from("stock_opnames").select("id, opname_number, status, planned_date, notes, cold_storages(code, name)").eq("id", data).single());
      if (created.error) throw created.error;
      const opname = created.data as unknown as Opname;
      setSelected(opname);
      await loadItems(opname.id);
      setNotes("");
      setMessage(`${opname.opname_number} dibuat. Count seluruh item sebelum submit approval.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Gagal membuat stock opname.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCounts() {
    if (!selected || !organizationId) return;
    setIsSaving(true);
    setError(null);
    try {
      for (const item of items) {
        const count = counts[item.id];
        const counted = Number(count?.quantity);
        const countedKg = count?.quantityKg === "" ? null : Number(count?.quantityKg);
        if (!Number.isFinite(counted) || counted < 0 || (countedKg !== null && (!Number.isFinite(countedKg) || countedKg < 0))) {
          throw new Error(`Jumlah count ${item.products?.name || item.id} harus valid dan tidak negatif.`);
        }
        if (item.planned_quantity_kg !== null && item.planned_quantity_kg !== undefined && countedKg === null) {
          throw new Error(`Jumlah KG count ${item.products?.name || item.id} wajib diisi.`);
        }
        const { error: updateError } = await createClient().from("stock_opname_items").update({
          counted_quantity: counted,
          counted_quantity_kg: countedKg,
          variance_quantity: counted - Number(item.planned_quantity),
          variance_quantity_kg: countedKg === null ? null : countedKg - Number(item.planned_quantity_kg || item.planned_quantity),
          variance_reason: count?.reason || null,
          photo_url: count?.photoUrl || null,
        }).eq("id", item.id);
        if (updateError) throw updateError;
      }
      await loadItems(selected.id);
      setMessage("Count, variance, reason, dan evidence tersimpan.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan count.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitForApproval() {
    if (!selected) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      for (const item of items) {
        if (counts[item.id]?.quantity === "") throw new Error("Count semua item sebelum submit.");
        const variance = Number(counts[item.id].quantity) - Number(item.planned_quantity);
        if (variance !== 0 && !counts[item.id]?.reason.trim()) throw new Error("Alasan diperlukan untuk setiap selisih.");
        if (item.planned_quantity_kg !== null && item.planned_quantity_kg !== undefined && counts[item.id]?.quantityKg === "") throw new Error("Count KG wajib diisi untuk item yang memiliki quantity KG.");
      }
      await saveCounts();
      const { error: submitError } = await createClient().rpc("submit_stock_opname", { p_opname_id: selected.id, p_performed_by: actorId });
      if (submitError) throw submitError;
      setMessage("Stock opname dikirim untuk persetujuan Director.");
      if (organizationId) await loadOpnames(organizationId);
      setSelected((current) => current ? { ...current, status: "PENDING_APPROVAL" } : current);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal mengirim stock opname.");
    } finally {
      setIsSaving(false);
    }
  }

  const activeColdStorages = coldStorages.filter((item) => item.warehouse_id === warehouseId);
  const canCount = selected?.status === "IN_PROGRESS";

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="GUDANG" title="Stock Opname" description="Create → count → variance/reason/evidence → approval → adjustment ledger." />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        <form onSubmit={(event) => void createOpname(event)} className="grid gap-3 border-b border-line pb-5 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Warehouse" required options={[{ value: "", label: "Pilih warehouse" }, ...warehouses.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} }))]} value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setColdStorageId(""); }} />
          <Select label="Cold storage" options={[{ value: "", label: "Semua cold storage" }, ...activeColdStorages.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} }))]} value={coldStorageId} onChange={(event) => setColdStorageId(event.target.value)} disabled={!warehouseId} />
          <Input label="Tanggal rencana" type="date" required value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} />
          <div className="flex items-end"><Button type="submit" loading={isSaving} disabled={isLoading || !warehouseId}>Buat opname</Button></div>
          <div className="sm:col-span-2 xl:col-span-4"><Textarea label="Catatan opname" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        </form>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.75fr)]">
          <section><h2 className="mb-3 font-semibold text-ink">Daftar opname</h2>{isLoading ? <p className="py-6 text-sm text-slate-500">Memuat...</p> : opnames.length === 0 ? <p className="rounded-xl border border-dashed border-line p-6 text-sm text-slate-500">Belum ada stock opname.</p> : <ul className="divide-y divide-line rounded-xl border border-line bg-white">{opnames.map((opname) => <li key={opname.id}><button type="button" onClick={() => { setSelected(opname); void loadItems(opname.id).catch((loadError) => setError(loadError.message)); }} className={`w-full p-4 text-left hover:bg-slate-50 ${selected?.id === opname.id ? "bg-primary-soft" : ""}}><span className="flex items-center justify-between gap-2"><strong className="font-mono text-sm">{opname.opname_number}</strong><StatusBadge tone={opname.status === "APPROVED" ? "success" : opname.status === "PENDING_APPROVAL" ? "warning" : "neutral"}>{opname.status}</StatusBadge></span><span className="mt-1 block text-xs text-slate-500">{opname.cold_storages?.code || "Semua lokasi"} · {opname.planned_date}</span></button></li>)}</ul>}</section>
          <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-ink">{selected ? selected.opname_number : "Count items"}</h2><p className="text-sm text-slate-500">{selected ? selected.status : "Pilih atau buat stock opname."}</p></div>{selected && canCount && <div className="flex gap-2"><Button variant="secondary" loading={isSaving} onClick={() => void saveCounts()}>Simpan count</Button><Button loading={isSaving} onClick={() => void submitForApproval()}>Submit approval</Button></div>}</div>
            {!selected ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">Pilih opname untuk mengisi hitungan.</div> : items.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">Tidak ada item snapshot.</div> : <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[1120px]"><thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600"><th className="px-3 py-3">Produk / batch</th><th className="px-3 py-3">Lokasi</th><th className="px-3 py-3 text-right">Sistem</th><th className="px-3 py-3">Count unit / KG</th><th className="px-3 py-3">Selisih</th><th className="px-3 py-3">Reason / evidence URL</th></tr></thead><tbody className="divide-y divide-line">{items.map((item) => { const input = counts[item.id] || { quantity: "", quantityKg: "", reason: "", photoUrl: "" }; const variance = input.quantity === "" ? null : Number(input.quantity) - Number(item.planned_quantity); return <tr key={item.id}><td className="px-3 py-3 text-sm font-medium">{item.products?.name || "-"}<span className="block text-xs text-slate-500">{item.products?.sku || "-"} · {item.batches?.batch_number || "-"}</span></td><td className="px-3 py-3 text-sm">{item.storage_locations?.code || "-"}</td><td className="px-3 py-3 text-right text-sm">{formatNumber(Number(item.planned_quantity))}<span className="block text-xs text-slate-500">{formatNumber(Number(item.planned_quantity_kg || 0))} KG</span></td><td className="px-3 py-3"><div className="grid gap-2"><Input aria-label={`Count ${item.products?.name}} type="number" min="0" step="0.001" value={input.quantity} disabled={!canCount} onChange={(event) => setCounts((current) => ({ ...current, [item.id]: { ...input, quantity: event.target.value } }))} />{item.planned_quantity_kg !== null && item.planned_quantity_kg !== undefined && <Input aria-label={`Count KG ${item.products?.name}} type="number" min="0" step="0.001" placeholder="KG" value={input.quantityKg} disabled={!canCount} onChange={(event) => setCounts((current) => ({ ...current, [item.id]: { ...input, quantityKg: event.target.value } }))} />}</div></td><td className={`px-3 py-3 text-right text-sm font-semibold ${variance !== null && variance < 0 ? "text-danger" : "text-ink"}}>{variance === null ? "-" : formatNumber(variance)}</td><td className="px-3 py-3"><div className="grid gap-2"><Select aria-label={`Reason ${item.products?.name}} options={[{ value: "", label: "Reason jika selisih" }, ...varianceReasons.map((reason) => ({ value: reason, label: reason }))]} value={input.reason} disabled={!canCount} onChange={(event) => setCounts((current) => ({ ...current, [item.id]: { ...input, reason: event.target.value } }))} /><Input aria-label={`Evidence URL ${item.products?.name}} type="url" placeholder="URL evidence foto" value={input.photoUrl} disabled={!canCount} onChange={(event) => setCounts((current) => ({ ...current, [item.id]: { ...input, photoUrl: event.target.value } }))} /></div></td></tr>; })}</tbody></table></div>}
          </section>
        </div>
      </div>
    </AppShell>
  );
}