"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/use-permissions";
import { formatDateTime, formatNumber } from "@/lib/utils";

type ReturnType = "CUSTOMER_RETURN" | "SUPPLIER_RETURN";
interface Option { id: string; code: string; name: string; unit_id?: string; }
interface ProductOption { id: string; sku: string; name: string; unit_id: string; units: { code: string }[]; }
interface LocationOption extends Option { cold_storage_id: string; warehouse_id: string; cold_storages: { code: string } | null; }
interface InventoryOption {
  id: string; quantity: number; quantity_kg: number | null; status: string;
  product_id: string; batch_id: string; warehouse_id: string; cold_storage_id: string;
  storage_location_id: string; unit_id: string;
  products: { name: string; sku: string } | null;
  batches: { batch_number: string } | null;
  cold_storages: { code: string } | null;
  storage_locations: { code: string } | null;
}
interface ReturnRecord {
  id: string; return_number: string; return_type: ReturnType; reason: string; status: string;
  notes: string | null; created_at: string;
  inventory_return_items: Array<{ quantity_kg: number; products: { name: string } | null }>;
}

const returnReasons = ["DAMAGED", "WRONG_ITEM", "WRONG_QTY", "QUALITY", "EXPIRED", "OTHER"];


const getStatusTone = (status: string): "neutral" | "success" | "warning" | "danger" | "info" => {
  const m: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
    APPROVED: "success",
    PENDING_APPROVAL: "warning",
    REJECTED: "danger",
  };
  return m[status] ?? "neutral";
};

function ReturnRow({ record }: { record: ReturnRecord }) {
  return <tr key={record.id}><td className="px-4 py-3 font-mono text-sm">{record.return_number}</td><td className="px-4 py-3 text-sm">{record.return_type}</td><td className="px-4 py-3 text-sm">{record.inventory_return_items?.[0]?.products?.name || "-"}</td><td className="px-4 py-3 text-sm">{record.reason}</td><td className="px-4 py-3 text-right text-sm">{formatNumber(Number(record.inventory_return_items?.[0]?.quantity_kg || 0))}</td><td className="px-4 py-3"><StatusBadge tone={getStatusTone(record.status)}>{record.status}</StatusBadge></td><td className="px-4 py-3 text-sm">{formatDateTime(record.created_at)}</td></tr>;
}
export default function ReturnsPage() {
  const { userId, loaded } = useSession();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [returnType, setReturnType] = useState<ReturnType>("CUSTOMER_RETURN");
  const [customers, setCustomers] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [batches, setBatches] = useState<Array<{ id: string; batch_number: string; product_id: string }>>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [productId, setProductId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [inventoryId, setInventoryId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("QUALITY");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (loaded && !userId) {
      router.replace("/login");
    }
  }, [loaded, userId, router]);

  const load = useCallback(async (orgId: string, userId: string) => {
    const supabase = createClient();
    const [customerResult, supplierResult, productResult, batchResult, locationResult, inventoryResult, returnResult] = await Promise.all([
      supabase.from("customers").select("id, code, name").eq("organization_id", orgId).eq("active", true).order("name"),
      supabase.from("suppliers").select("id, code, name").eq("organization_id", orgId).eq("active", true).order("name"),
      supabase.from("products").select("id, sku, name, unit_id, units(code)").eq("organization_id", orgId).eq("active", true).order("name"),
      supabase.from("batches").select("id, batch_number, product_id").eq("organization_id", orgId).eq("status", "ACTIVE").order("batch_number"),
      supabase.from("storage_locations").select("id, code, name, cold_storage_id, warehouse_id, cold_storages(code)").eq("organization_id", orgId).eq("active", true).order("code"),
      supabase.from("inventory").select("id, quantity, quantity_kg, status, product_id, batch_id, warehouse_id, cold_storage_id, storage_location_id, unit_id, products(name, sku), batches(batch_number), cold_storages(code), storage_locations(code)").eq("organization_id", orgId).eq("owner_type", "COMPANY").eq("owner_id", orgId).eq("status", "AVAILABLE").gt("quantity", 0).order("created_at", { ascending: false }),
      supabase.from("inventory_returns").select("id, return_number, return_type, reason, status, notes, created_at, inventory_return_items(quantity_kg, products(name))").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
    ]);
    const failed = [customerResult, supplierResult, productResult, batchResult, locationResult, inventoryResult, returnResult].find((result) => result.error);
    if (failed?.error) throw failed.error;
    setOrganizationId(orgId);
    setActorId(userId);
    setCustomers((customerResult.data || []) as Option[]);
    setSuppliers((supplierResult.data || []) as Option[]);
    setProducts((productResult.data || []) as ProductOption[]);
    setBatches((batchResult.data || []) as Array<{ id: string; batch_number: string; product_id: string }>);
    setLocations((locationResult.data || []) as unknown as LocationOption[]);
    setInventory((inventoryResult.data || []) as unknown as InventoryOption[]);
    setReturns((returnResult.data || []) as unknown as ReturnRecord[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      if (!userId) return;
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getClaims();
        const uid = claimsData?.claims?.sub;
        if (!uid) throw new Error("Silakan login untuk mengelola return.");
        const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", uid).eq("is_active", true).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        await load(membership.organization_id, uid);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat returns.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [userId, load]);

  const sourceInventory = inventory.find((item) => item.id === inventoryId);
  const filteredBatches = batches.filter((batch) => batch.product_id === productId);

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !actorId) return;
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Jumlah return harus lebih besar dari nol KG.");
      setMessage(null);
      return;
    }
    if (returnType === "CUSTOMER_RETURN" && (!productId || !batchId || !locationId || !counterpartyId)) {
      setError("Customer, produk, batch, dan lokasi tujuan wajib dipilih.");
      setMessage(null);
      return;
    }
    if (returnType === "SUPPLIER_RETURN" && (!counterpartyId || !sourceInventory)) {
      setError("Supplier dan sumber stok wajib dipilih.");
      setMessage(null);
      return;
    }
    if (sourceInventory && (amount > Number(sourceInventory.quantity_kg || 0) || amount > Number(sourceInventory.quantity))) {
      setError("Return melebihi stok sumber yang tersedia.");
      setMessage(null);
      return;
    }
    const location = locations.find((item) => item.id === locationId);
    const product = products.find((item) => item.id === productId);
    if (returnType === "CUSTOMER_RETURN" && product?.units?.[0]?.code !== "KG") {
      setError("Customer return saat ini hanya menerima produk dengan satuan KG.");
      setMessage(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { data: returnId, error: createError } = await createClient().rpc("create_inventory_return", {
        p_organization_id: organizationId,
        p_return_type: returnType,
        p_counterparty_id: counterpartyId,
        p_reason: reason,
        p_inventory_id: sourceInventory?.id || null,
        p_batch_id: sourceInventory?.batch_id || batchId,
        p_product_id: sourceInventory?.product_id || productId,
        p_warehouse_id: sourceInventory?.warehouse_id || location?.warehouse_id,
        p_cold_storage_id: sourceInventory?.cold_storage_id || location?.cold_storage_id,
        p_storage_location_id: sourceInventory?.storage_location_id || locationId,
        p_quantity: sourceInventory ? amount / Number(sourceInventory.quantity_kg || amount) * Number(sourceInventory.quantity) : amount,
        p_quantity_kg: amount,
        p_unit_id: sourceInventory?.unit_id || product?.unit_id,
        p_notes: notes || null,
        p_performed_by: actorId,
      });
      if (createError) throw createError;
      const { error: submitError } = await createClient().rpc("submit_inventory_return", { p_return_id: returnId, p_performed_by: actorId });
      if (submitError) throw submitError;
      setMessage("Return dikirim untuk persetujuan Director; stok berubah setelah disetujui.");
      setCounterpartyId(""); setProductId(""); setBatchId(""); setLocationId(""); setInventoryId(""); setQuantity(""); setNotes("");
      await load(organizationId, actorId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Return gagal disimpan.");
    } finally {
      setIsSaving(false);
    }
  }

  const statusToneMap: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
    APPROVED: "success",
    PENDING_APPROVAL: "warning",
    REJECTED: "danger",
  };
  const getStatusTone = (status: string) => statusToneMap[status] ?? "neutral";

  if (!loaded) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Memuat...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="SUPPLY CHAIN" title="Returns" description="Customer return masuk sebagai quarantine; supplier return mengurangi company inventory setelah approval." />
        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        <form onSubmit={(event) => void submitReturn(event)} className="grid gap-4 border-b border-line pb-6 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Jenis return" options={[{ value: "CUSTOMER_RETURN", label: "Customer Return" }, { value: "SUPPLIER_RETURN", label: "Supplier Return" }]} value={returnType} onChange={(event) => { setReturnType(event.target.value as ReturnType); setCounterpartyId(""); setInventoryId(""); setProductId(""); setBatchId(""); setLocationId(""); }} />
          <Select label={returnType === "CUSTOMER_RETURN" ? "Customer" : "Supplier"} required options={[{ value: "", label: "Pilih counterparty" }, ...(returnType === "CUSTOMER_RETURN" ? customers : suppliers).map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))]} value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)} />
          <Select label="Reason" required options={returnReasons.map((item) => ({ value: item, label: item }))} value={reason} onChange={(event) => setReason(event.target.value)} />
          {returnType === "CUSTOMER_RETURN" ? <>
            <Select label="Produk (KG)" required options={[{ value: "", label: "Pilih produk" }, ...products.filter((item) => item.units?.[0]?.code === "KG").map((item) => ({ value: item.id, label: `${item.sku} · ${item.name}` }))]} value={productId} onChange={(event) => { setProductId(event.target.value); setBatchId(""); }} />
            <Select label="Batch" required options={[{ value: "", label: "Pilih batch" }, ...filteredBatches.map((item) => ({ value: item.id, label: item.batch_number }))]} value={batchId} onChange={(event) => setBatchId(event.target.value)} disabled={!productId} />
            <Select label="Lokasi tujuan" required options={[{ value: "", label: "Pilih lokasi" }, ...locations.map((item) => ({ value: item.id, label: `${item.cold_storages?.code || "-"}/${item.code} · ${item.name}` }))]} value={locationId} onChange={(event) => setLocationId(event.target.value)} />
          </> : <Select label="Stok sumber" required options={[{ value: "", label: "Pilih stok perusahaan" }, ...inventory.map((item) => ({ value: item.id, label: `${item.products?.name || "-"} · ${item.batches?.batch_number || "-"} · sisa ${formatNumber(Number(item.quantity_kg || 0))} KG` }))]} value={inventoryId} onChange={(event) => { const source = inventory.find((item) => item.id === event.target.value); setInventoryId(event.target.value); setQuantity(source?.quantity_kg ? String(source.quantity_kg) : ""); }} />}
          <Input label="Jumlah (KG)" required type="number" min="0.001" step="0.001" max={sourceInventory?.quantity_kg || undefined} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          <div className="sm:col-span-2 xl:col-span-3"><Textarea label="Catatan" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
          <div className="flex items-end"><Button type="submit" loading={isSaving} disabled={isLoading}>Kirim untuk approval</Button></div>
        </form>
        <section className="mt-7"><div className="mb-3"><h2 className="font-semibold text-ink">Return terbaru</h2><p className="text-sm text-slate-500">Ledger movement dibuat setelah persetujuan Director.</p></div>{isLoading ? <p className="py-8 text-center text-sm text-slate-500">Memuat return...</p> : returns.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">Belum ada return.</div> : <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600"><th className="px-4 py-3">Nomor</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">Produk</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3 text-right">KG</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Dibuat</th></tr></thead><tbody className="divide-y divide-line">{returns.map((record) => <ReturnRow record={record} />)}</tbody></table></div>}</section>
      </div>
    </AppShell>
  );
}
