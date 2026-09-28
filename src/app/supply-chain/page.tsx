import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

const workflows = [
  { title: "Purchasing", description: "Purchase request, supplier quotation, approval, and purchase order.", href: "/supply-chain/purchasing" },
  { title: "Receiving & QC", description: "Penerimaan barang, hasil pemeriksaan, dan status QC.", href: "/supply-chain/receiving" },
  { title: "Sales", description: "Quotation dan sales order customer.", href: "/supply-chain/sales" },
  { title: "Picking", description: "Alokasi FEFO dari stok eligible.", href: "/supply-chain/picking" },
  { title: "Delivery", description: "Delivery order dan status pengiriman.", href: "/supply-chain/delivery" },
  { title: "Returns", description: "Return flow belum tersedia pada schema aktif.", href: "/supply-chain/returns" },
];

export default async function SupplyChainPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="SUPPLY CHAIN" title="Pengadaan & Distribusi" description="Alur barang milik perusahaan dari purchasing, receiving, QC, sales, sampai delivery." />
        <div className="grid gap-x-8 md:grid-cols-2">
          {workflows.map((workflow) => <Link key={workflow.href} href={workflow.href} className="group flex items-start justify-between gap-4 border-b border-line py-5 hover:bg-white"><div><h2 className="font-semibold text-ink group-hover:text-primary">{workflow.title}</h2><p className="mt-1 text-sm text-slate-500">{workflow.description}</p></div><span aria-hidden="true" className="text-lg text-slate-400 group-hover:text-primary">→</span></Link>)}
        </div>
      </div>
    </AppShell>
  );
}