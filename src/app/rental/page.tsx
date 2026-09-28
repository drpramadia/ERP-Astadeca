import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

const rentalWorkflows = [
  { title: "Kontrak", href: "/rental/contracts", description: "Status persetujuan dan periode kontrak customer." },
  { title: "Customer", href: "/rental/customers", description: "Customer rental dan kontrak terkait." },
  { title: "Inventory", href: "/rental/inventory", description: "Saldo stok customer-owned dan allocation aktif." },
  { title: "Penerimaan", href: "/rental/receiving", description: "Receive melalui rental contract dan allocation." },
  { title: "Pelepasan", href: "/rental/release", description: "Release penuh atau sebagian dengan movement ledger." },
  { title: "Billing", href: "/rental/billing", description: "Rental charge immutable dan invoice." },
];

export default async function RentalPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="COLD STORAGE RENTAL" title="Rental" description="Stok rental adalah milik customer dan dicatat terpisah dari company inventory." />
        <div className="grid gap-x-8 md:grid-cols-2">{rentalWorkflows.map((workflow) => <Link key={workflow.href} href={workflow.href} className="group flex items-start justify-between gap-4 border-b border-line py-5 hover:bg-white"><div><h2 className="font-semibold text-ink group-hover:text-primary">{workflow.title}</h2><p className="mt-1 text-sm text-slate-500">{workflow.description}</p></div><span aria-hidden="true" className="text-lg text-slate-400 group-hover:text-primary">→</span></Link>)}</div>
      </div>
    </AppShell>
  );
}