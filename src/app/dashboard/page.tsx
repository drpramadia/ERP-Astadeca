"use strict"
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, formatKg, getBadgeTone } from "@/lib/utils";
import Link from "next/link";

async function getDashboardData(organizationId: string) {
  const supabase = await createClient();

  const [
    stockByStatusRes,
    pendingApprovalsRes,
    recentMovementsRes,
    expiringSoonRes,
    activePurchaseRes,
    activeSalesRes,
    activeDeliveryRes,
  ] = await Promise.all([
    supabase.rpc("get_stock_by_status", { p_organization_id: organizationId, p_warehouse_id: null, p_cold_storage_id: null }),
    supabase.from("approval_requests").select("id, status").eq("organization_id", organizationId).eq("status", "PENDING"),
    supabase.from("inventory_movements").select("id, movement_type, quantity_kg, performed_at, products!movements_product_id_fkey(name, sku), batches!movements_batch_id_fkey(batch_number), profiles!movements_performed_by_fkey(full_name)").eq("organization_id", organizationId).order("performed_at", { ascending: false }).limit(8),
    supabase.from("inventory").select("quantity_kg").eq("organization_id", organizationId).in("status", ["AVAILABLE", "QUARANTINE", "RESERVED"]),
    supabase.from("inventory").select("id, quantity_kg, batches!inventory_batch_fkey(expiry_date)").eq("organization_id", organizationId).eq("status", "AVAILABLE").not("batches.expiry_date", "is", null).lt("batches.expiry_date", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
    supabase.from("purchase_orders").select("id").eq("organization_id", organizationId).in("status", ["PENDING_APPROVAL", "SUBMITTED"]),
    supabase.from("sales_orders").select("id").eq("organization_id", organizationId).in("status", ["PENDING_APPROVAL", "SUBMITTED"]),
    supabase.from("delivery_orders").select("id").eq("organization_id", organizationId).eq("status", "IN_TRANSIT"),
  ]);

  const failedQuery = [stockByStatusRes, pendingApprovalsRes, recentMovementsRes, expiringSoonRes]
    .find((result) => result.error);
  if (failedQuery?.error) throw failedQuery.error;

  const capacityInventoryRes = await supabase
    .from("inventory")
    .select("cold_storage_id, quantity_kg")
    .eq("organization_id", organizationId)
    .in("status", ["AVAILABLE", "QUARANTINE"]);
  if (capacityInventoryRes.error) throw capacityInventoryRes.error;

  const occupiedByColdStorage = new Map<string, number>();
  for (const inventoryRow of capacityInventoryRes.data || []) {
    occupiedByColdStorage.set(
      inventoryRow.cold_storage_id,
      (occupiedByColdStorage.get(inventoryRow.cold_storage_id) || 0) + Number(inventoryRow.quantity_kg || 0)
    );
  }

  const pendingCount = pendingApprovalsRes.data?.length || 0;
  const recentMovements = recentMovementsRes.data || [];
  const stockByStatus = (stockByStatusRes.data || []) as { status: string; total_quantity: number; total_quantity_kg: number }[];
  const totalStock = stockByStatus.reduce((sum, s) => sum + Number(s.total_quantity_kg || 0), 0);
  const availableStock = stockByStatus.find(s => s.status === "AVAILABLE")?.total_quantity_kg || 0;
  const quarantineStock = stockByStatus.find(s => s.status === "QUARANTINE")?.total_quantity_kg || 0;
  const inventoryValue = 0;
  const expiringCount = expiringSoonRes.data?.length || 0;
  const activePurchasing = activePurchaseRes.data?.length || 0;
  const activeSales = activeSalesRes.data?.length || 0;
  const activeDelivery = activeDeliveryRes.data?.length || 0;
  return {
    coldStorages: [],
    totalStock,
    availableStock,
    quarantineStock,
    pendingCount,
    recentMovements,
    stockByStatus,
    inventoryValue,
    expiringCount,
    activePurchasing,
    activeSales,
    activeDelivery,
  };
}

type RecentMovement = {
  id: string;
  movement_type: string;
  products?: { name: string; sku: string } | null;
  batches?: { batch_number: string } | null;
  quantity_kg: number;
  performed_at: string;
  profiles?: { full_name?: string } | null;
};

function MovementRow({ movement }: { movement: RecentMovement }) {
  const typeLabels: Record<string, string> = {
    RECEIVE: "Penerimaan", ISSUE: "Pengeluaran", TRANSFER_OUT: "Transfer Keluar",
    TRANSFER_IN: "Transfer Masuk", ADJUSTMENT: "Penyesuaian", RETURN: "Retur",
    DAMAGE: "Kerusakan", EXPIRY: "Kedaluwarsa",
  };
  const typeColors: Record<string, string> = {
    RECEIVE: "text-emerald-600 bg-emerald-50", ISSUE: "text-rose-600 bg-rose-50",
    TRANSFER_OUT: "text-amber-600 bg-amber-50", TRANSFER_IN: "text-blue-600 bg-blue-50",
    ADJUSTMENT: "text-purple-600 bg-purple-50", RETURN: "text-orange-600 bg-orange-50",
    DAMAGE: "text-red-600 bg-red-50", EXPIRY: "text-slate-600 bg-slate-50",
  };
  const colorClass = typeColors[movement.movement_type] || "text-slate-600 bg-slate-50";
  return (
    <div className="flex items-center justify-between py-3 border-b border-line last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${colorClass}`}>{typeLabels[movement.movement_type] || movement.movement_type}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{movement.products?.name || "Produk tidak ditemukan"}</p>
          <p className="text-xs text-slate-500">Batch: {movement.batches?.batch_number || "-"} - {formatNumber(movement.quantity_kg)} KG</p>
        </div>
      </div>
      <div className="text-right shrink-0 ml-3">
        <p className="text-xs text-slate-500">{new Date(movement.performed_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</p>
        <p className="text-[10px] text-slate-400">{movement.profiles?.full_name || "-"}</p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user ?? null;
  if (!user) { redirect("/login"); }
  const userId = user.id;
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const { data: membership } = await supabase.from("organization_memberships").select("organization_id, role_id").eq("user_id", userId).eq("is_active", "true").maybeSingle();
  if (!membership) {
    return (<AppShell><div className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-8 shadow-sm"><h1 className="text-2xl font-semibold text-ink">Akses belum tersedia</h1><p className="mt-3 text-sm text-slate-600">User berhasil login, tetapi belum memiliki membership pada organisasi.</p></div></AppShell>);
  }
  const { data: organization } = await supabase.from("organizations").select("id, name").eq("id", membership.organization_id).maybeSingle();
  const organizationName = organization?.name || "Nama Perusahaan";
  const fullName = profile?.full_name || "Director";
  let dashboardData: Awaited<ReturnType<typeof getDashboardData>>;
  try {
    dashboardData = await getDashboardData(membership.organization_id);
  } catch {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-ink">Ringkasan belum dapat dimuat</h1>
          <p className="mt-3 text-sm text-slate-600">Terjadi kendala saat mengambil data operasional. Muat ulang halaman atau hubungi administrator.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="ASTADECA" title="Ringkasan Operasional" description="Pantau persediaan, cold storage, pembelian, penjualan, pengiriman, dan aktivitas operasional."
          actions={<div className="flex flex-wrap items-center gap-2"><StatusBadge tone="info">{organizationName}</StatusBadge><StatusBadge tone="success">{fullName}</StatusBadge></div>} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total Persediaan" value={formatNumber(dashboardData.totalStock)} unit="KG" description="Barang milik perusahaan & customer" />
          <KpiCard label="Stok Tersedia" value={formatNumber(dashboardData.availableStock)} unit="KG" description="Siap diproses" />
          <KpiCard label="Quarantine" value={formatNumber(dashboardData.quarantineStock)} unit="KG" description="Menunggu QC release" />
          <KpiCard label="Menunggu Persetujuan" value={dashboardData.pendingCount} unit="Dokumen" description="Butuh otorisasi" />
        </div>
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="text-[20px] font-semibold tracking-[-0.03em] text-ink">Cold Storage</h2><p className="text-sm text-slate-500">Kapasitas dan status operasional penyimpanan.</p></div>
            <Link href="/warehouse" className="text-sm font-medium text-primary hover:underline">Kelola</Link>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
          </div>
        </section>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section>
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-[20px] font-semibold tracking-[-0.03em] text-ink">Aktivitas Terbaru</h2><p className="text-sm text-slate-500">Movement persediaan terbaru.</p></div><Link href="/warehouse/movements" className="text-sm font-medium text-primary hover:underline">Lihat semua</Link></div>
            <div className="rounded-2xl border border-line bg-white p-4">
              {dashboardData.recentMovements.length > 0 ? (
                (dashboardData.recentMovements as unknown as RecentMovement[]).map((movement) => (
                  <MovementRow key={movement.id} movement={movement} />
                ))
              ) : (
                <div className="py-8 text-center"><p className="text-sm text-slate-500">Belum ada aktivitas movement.</p><p className="text-xs text-slate-400 mt-1">Movement akan muncul setelah ada transaksi persediaan.</p></div>
              )}
            </div>
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-[20px] font-semibold tracking-[-0.03em] text-ink">Status Persediaan</h2><p className="text-sm text-slate-500">Distribusi stok berdasarkan status.</p></div><Link href="/warehouse/inventory" className="text-sm font-medium text-primary hover:underline">Lihat detail</Link></div>
            <div className="rounded-2xl border border-line bg-white p-4">
              {dashboardData.stockByStatus.length > 0 ? (
                <div className="space-y-3">{dashboardData.stockByStatus.map((status: { status: string; total_quantity: number; total_quantity_kg: number }) => (
                  <div key={status.status} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getBadgeTone(status.status) === "success" ? "bg-emerald-50 text-emerald-700" : getBadgeTone(status.status) === "warning" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{status.status}</span>
                    <div className="text-right"><p className="text-sm font-semibold text-ink">{formatNumber(Number(status.total_quantity_kg || 0))} KG</p><p className="text-[10px] text-slate-500">{formatNumber(Number(status.total_quantity || 0))} batch</p></div>
                  </div>
                ))}</div>
              ) : (
                <div className="py-8 text-center"><p className="text-sm text-slate-500">Belum ada data persediaan.</p><p className="text-xs text-slate-400 mt-1">Data akan muncul setelah ada penerimaan barang.</p></div>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}