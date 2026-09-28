import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";

const WarehouseIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const MovementsIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);

const TransferIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);

const OpnameIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const AdjustmentIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
  </svg>
);

const QcIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

function NavCard({ title, description, href, icon: Icon, badge }: { title: string; description: string; href: string; icon: React.ComponentType; badge?: string }) {
  return (
    <Link href={href} className="group rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-amber-300 hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-amber-50 p-3 text-amber-600 transition-colors group-hover:bg-amber-100"><Icon /></div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900 group-hover:text-amber-700">{title}</h3>
            {badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{badge}</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <svg className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

export default async function WarehousePage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;

  if (!claims) {
    redirect("/login");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="GUDANG" title="Warehouse & Inventory" description="Pergerakan barang perusahaan, stock count, transfer, dan penyesuaian." />
        <div className="grid gap-6">
          <div>
            <h2 className="mb-4 text-lg font-semibold text-ink">Modul Persediaan</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <NavCard
                title="Persediaan"
                description="Kelola dan pantau stok barang di cold storage"
                href="/warehouse/inventory"
                icon={WarehouseIcon}
              />
              <NavCard
                title="Riwayat Movement"
                description="Ledger immutabel semua perubahan persediaan"
                href="/warehouse/movements"
                icon={MovementsIcon}
              />
              <NavCard
                title="Transfer"
                description="Pindahkan barang antar cold storage atau lokasi"
                href="/warehouse/transfer"
                icon={TransferIcon}
              />
              <NavCard
                title="Stock Opname"
                description="Lakukan stock opname berkala"
                href="/warehouse/stock-opname"
                icon={OpnameIcon}
              />
              <NavCard
                title="Penyesuaian"
                description="Catat penyesuaian stok (damage, expiry, loss)"
                href="/warehouse/adjustments"
                icon={AdjustmentIcon}
              />
              <NavCard
                title="Kendali Mutu"
                description="QC inspection dan quarantine release"
                href="/supply-chain/receiving"
                icon={QcIcon}
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}