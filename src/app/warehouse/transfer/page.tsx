"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatNumber } from "@/lib/utils";

interface SourceInventory {
  id: string;
  quantity: number;
  quantity_kg: number | null;
  status: string;
  product_id: string;
  storage_location_id: string;
  products: { name: string; sku: string } | null;
  batches: { batch_number: string; expiry_date: string | null } | null;
  cold_storages: { code: string } | null;
  storage_locations: { code: string } | null;
  units: { code: string } | null;
}

interface DestinationLocation {
  id: string;
  code: string;
  name: string;
  cold_storage_id: string;
  cold_storages: { code: string } | null;
}

interface Movement {
  id: string;
  movement_number: string;
  movement_type: string;
  quantity_kg: number | null;
  performed_at: string;
  transfer_reference_id: string | null;
  products: { name: string } | null;
}

export default function TransferPage() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<SourceInventory[]>([]);
  const [locations, setLocations] = useState<DestinationLocation[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(orgId: string, userId: string) {
    const supabase = createClient();
    const [inventoryResult, locationResult, movementResult] = await Promise.all([
      supabase.from("inventory").select("id, quantity, quantity_kg, status, product_id, storage_location_id, products(name, sku), batches(batch_number, expiry_date), storage_locations(code), units(code)").eq("organization_id", orgId).eq("owner_type", "COMPANY").eq("owner_id", orgId).eq("status", "AVAILABLE").gt("quantity", 0).order("created_at", { ascending: false }),
      supabase.from("storage_locations").select("id, code, name, cold_storage_id, cold_storages(code)").eq("organization_id", orgId).eq("active", true).order("code"),
      supabase.from("inventory_movements").select("id, movement_number, movement_type, quantity_kg, performed_at, transfer_reference_id, products(name)").eq("organization_id", orgId).in("movement_type", ["TRANSFER_OUT", "TRANSFER_IN"]).order("performed_at", { ascending: false }).limit(50),
    ]);
    const failed = [inventoryResult, locationResult, movementResult].find((result) => result.error);
    if (failed?.error) throw failed.error;
    setOrganizationId(orgId);
    setActorId(userId);
    setInventory((inventoryResult.data || []) as unknown as SourceInventory[]);
    setLocations((locationResult.data || []) as unknown as DestinationLocation[]);
    setMovements((movementResult.data || []) as unknown as Movement[]);
  }

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error("Silakan login untuk melakukan transfer.");
        const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("is_active", true).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        await load(membership.organization_id, userId);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat data transfer.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const source = inventory.find((item) => item.id === sourceId);
  const destinationOptions = locations.filter((location) => location.id !== source?.storage_location_id);

  async function transfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !actorId || !source) return;
    const transferQuantity = Number(quantity);
    if (!Number.isFinite(transferQuantity) || transferQuantity <= 0 || transferQuantity > Number(source.quantity)) {
      setError("Jumlah harus lebih dari nol dan tidak melebihi stok sumber.");
      return;
    }
    if (!destinationId || destinationId === source.storage_location_id) {
      setError("Pilih lokasi tujuan yang berbeda dari lokasi sumber.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: transferError } = await createClient().rpc("transfer_inventory", {
        p_organization_id: organizationId,
        p_source_inventory_id: source.id,
        p_destination_location_id: destinationId,
        p_quantity: transferQuantity,
        p_notes: notes || null,
        p_performed_by: actorId,
      });
      if (transferError) throw transferError;
      const result = data?.[0];
      if (!result?.success) throw new Error(result?.message || "Transfer tidak berhasil.");
      setMessage(`Transfer ${formatNumber(transferQuantity)} ${source.units?.code || "unit"} selesai. Referensi ${result.movement_id}.`);
      setSourceId("");
      setDestinationId("");
      setQuantity("");
      setNotes("");
      await load(organizationId, actorId);
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Transfer gagal disimpan.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="GUDANG" title="Transfer Stok" description="Pindahkan company inventory antar cold storage atau lokasi; sistem membuat TRANSFER_OUT dan TRANSFER_IN." />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        <form onSubmit={(event) => void transfer(event)} className="grid gap-4 border-b border-line pb-6 md:grid-cols-2 xl:grid-cols-4">
          <Select label="Stok sumber" required options={[{ value: "", label: "Pilih batch dan lokasi" }, ...inventory.map((item) => ({ value: item.id, label: `${item.products?.sku || ""} ${item.products?.name || ""} · ${item.batches?.batch_number || "-"} · ${item.cold_storages?.code || "-"}/${item.storage_locations?.code || "-"}` }))]} value={sourceId} onChange={(event) => { setSourceId(event.target.value); setQuantity(""); setDestinationId(""); }} disabled={isLoading} />
          <Select label="Lokasi tujuan" required options={[{ value: "", label: "Pilih lokasi tujuan" }, ...destinationOptions.map((item) => ({ value: item.id, label: `${item.cold_storages?.code || "-"}/${item.code} · ${item.name}` }))]} value={destinationId} onChange={(event) => setDestinationId(event.target.value)} disabled={!sourceId} />
          <Input label={`Jumlah${source?.units?.code ? ` (${source.units.code})` : ""}`} required type="number" min="0.001" max={source?.quantity} step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={!sourceId} />
          <Input label="Catatan" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <div className="md:col-span-2 xl:col-span-4 flex justify-end"><Button type="submit" loading={isSaving} disabled={isLoading || !sourceId || !destinationId}>Konfirmasi transfer</Button></div>
        </form>
        {source && <p className="mt-3 text-sm text-slate-500">Stok tersedia: {formatNumber(Number(source.quantity))} {source.units?.code || "unit"} · {formatNumber(Number(source.quantity_kg || 0))} KG · batch {source.batches?.batch_number || "-"}</p>}
        <section className="mt-7"><div className="mb-3"><h2 className="font-semibold text-ink">Ledger transfer terbaru</h2><p className="text-sm text-slate-500">Pasangan movement ditautkan dengan transfer reference.</p></div>{isLoading ? <div className="py-8 text-center text-sm text-slate-500">Memuat ledger...</div> : movements.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">Belum ada movement transfer.</div> : <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[620px]"><thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600"><th className="px-4 py-3">Movement</th><th className="px-4 py-3">Tipe</th><th className="px-4 py-3">Produk</th><th className="px-4 py-3 text-right">KG</th><th className="px-4 py-3">Waktu</th></tr></thead><tbody className="divide-y divide-line">{movements.map((movement) => <tr key={movement.id}><td className="px-4 py-3 font-mono text-sm">{movement.movement_number}</td><td className="px-4 py-3 text-sm">{movement.movement_type}</td><td className="px-4 py-3 text-sm">{movement.products?.name || "-"}</td><td className="px-4 py-3 text-right text-sm">{formatNumber(Number(movement.quantity_kg || 0))}</td><td className="px-4 py-3 text-sm">{formatDateTime(movement.performed_at)}</td></tr>)}</tbody></table></div>}</section>
      </div>
    </AppShell>
  );
}