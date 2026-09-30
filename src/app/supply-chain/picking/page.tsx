"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatNumber } from "@/lib/utils";

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  units: { code: string } | null;
}

interface FefoRow {
  inventory_id: string;
  quantity: number;
  quantity_kg: number | null;
  expiry_date: string | null;
  storage_location_id: string;
}

interface InventoryDetails {
  id: string;
  batches: { batch_number: string; expiry_date: string | null } | null;
  cold_storages: { code: string } | null;
  storage_locations: { code: string } | null;
}

interface PickLine extends FefoRow {
  batch_number: string;
  cold_storage_code: string;
  location_code: string;
}

export default function PickingPage() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [lines, setLines] = useState<PickLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error("Silakan login untuk membuka picking.");
        const { data: membership, error: membershipError } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", userId)
          .eq("is_active", "true")
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        const { data, error: productsError } = await supabase
          .from("products")
          .select("id, sku, name, units(code)")
          .eq("organization_id", membership.organization_id)
          .eq("active", true)
          .order("name");
        if (productsError) throw productsError;
        if (!cancelled) {
          setActorId(userId);
          setOrganizationId(membership.organization_id);
          setProducts((data || []) as unknown as ProductOption[]);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat produk.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function preview() {
    if (!organizationId || !productId || Number(quantity) <= 0) {
      setError("Pilih produk dan masukkan jumlah yang valid.");
      return;
    }
    setIsPreviewing(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { data, error: fefoError } = await supabase.rpc("get_fefo_inventory", {
        p_organization_id: organizationId,
        p_product_id: productId,
        p_required_quantity: Number(quantity),
        p_owner_type: "COMPANY",
        p_owner_id: organizationId,
        p_cold_storage_id: null,
        p_storage_location_id: null,
      });
      if (fefoError) throw fefoError;

      const eligible = (data || []) as FefoRow[];
      if (eligible.length === 0) {
        setLines([]);
        setMessage("Tidak ada stok eligible. Quarantine dan batch kedaluwarsa tidak dapat dipilih.");
        return;
      }
      const { data: details, error: detailError } = await supabase
        .from("inventory")
        .select("id, batches(batch_number, expiry_date), cold_storages(code), storage_locations(code)")
        .in("id", eligible.map((row) => row.inventory_id));
      if (detailError) throw detailError;
      const detailById = new Map(((details || []) as unknown as InventoryDetails[]).map((item) => [item.id, item]));
      setLines(eligible.map((row) => {
        const detail = detailById.get(row.inventory_id);
        return {
          ...row,
          batch_number: detail?.batches?.batch_number || "-",
          cold_storage_code: detail?.cold_storages?.code || "-",
          location_code: detail?.storage_locations?.code || "-",
        };
      }));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Gagal menghitung FEFO.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function confirmPicking() {
    if (!organizationId || !actorId || !productId || Number(quantity) <= 0 || lines.length === 0) return;
    setIsPicking(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const referenceNumber = `PICK-${Date.now()}`;
      const { data, error: pickingError } = await supabase.rpc("issue_inventory_fefo", {
        p_organization_id: organizationId,
        p_product_id: productId,
        p_required_quantity: Number(quantity),
        p_owner_type: "COMPANY",
        p_owner_id: organizationId,
        p_reason: "PICKING",
        p_notes: "FEFO pick from supply-chain picking screen",
        p_reference_number: referenceNumber,
        p_performed_by: actorId,
      });
      if (pickingError) throw pickingError;
      const result = data?.[0];
      if (!result?.success) throw new Error(result?.message || "Picking tidak berhasil.");
      setMessage(`${formatNumber(Number(result.total_issued))} ${products.find((product) => product.id === productId)?.units?.code || "unit"} dipilih dengan FEFO. Ref: ${referenceNumber}`);
      setLines([]);
    } catch (pickingError) {
      setError(pickingError instanceof Error ? pickingError.message : "Gagal menyimpan picking.");
    } finally {
      setIsPicking(false);
    }
  }

  const selectedProduct = products.find((product) => product.id === productId);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="SUPPLY CHAIN" title="Picking" description="Pilih stok perusahaan berdasarkan expiry terdekat; batch quarantine dan expired tidak eligible." />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        <section className="border-b border-line pb-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
            <Select label="Produk" options={[{ value: "", label: "Pilih produk" }, ...products.map((product) => ({ value: product.id, label: `${product.sku} · ${product.name}` }))]} value={productId} onChange={(event) => { setProductId(event.target.value); setLines([]); }} disabled={isLoading} />
            <Input label={`Jumlah${selectedProduct?.units?.code ? ` (${selectedProduct.units.code})` : ""}`} type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            <Button loading={isPreviewing} onClick={() => void preview()}>Pratinjau FEFO</Button>
          </div>
        </section>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">Memuat produk...</div>
        ) : lines.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">Pratinjau alokasi FEFO akan muncul di sini.</div>
        ) : (
          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h2 className="font-semibold text-ink">Urutan alokasi</h2><p className="text-sm text-slate-500">Expiry paling dekat dipilih lebih dahulu.</p></div>
              <Button loading={isPicking} disabled={isPreviewing} onClick={() => void confirmPicking()}>Konfirmasi picking</Button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <table className="w-full min-w-[720px]">
                <thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                  <th className="px-4 py-3">Batch</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3">Lokasi</th><th className="px-4 py-3 text-right">Tersedia</th><th className="px-4 py-3 text-right">Diminta</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {lines.map((line, index) => {
                    const quantityBeforeLine = lines.slice(0, index).reduce((total, current) => total + Number(current.quantity), 0);
                    const requestedFromLine = Math.max(0, Math.min(Number(line.quantity), Number(quantity) - quantityBeforeLine));
                    return <tr key={line.inventory_id}>
                      <td className="px-4 py-3 text-sm font-medium text-ink">{line.batch_number}</td>
                      <td className="px-4 py-3 text-sm">{line.expiry_date ? formatDate(line.expiry_date) : "Tanpa expiry"}</td>
                      <td className="px-4 py-3 text-sm"><StatusBadge tone="neutral">{line.cold_storage_code}/{line.location_code}</StatusBadge></td>
                      <td className="px-4 py-3 text-right text-sm">{formatNumber(Number(line.quantity))} {selectedProduct?.units?.code || ""}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">{formatNumber(requestedFromLine)} {selectedProduct?.units?.code || ""}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}