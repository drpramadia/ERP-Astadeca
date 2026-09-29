"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";

type FinanceView = "receivables" | "payables" | "payments";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  currency: string;
  status: string;
  customers: { name: string } | null;
}

export function FinanceClient({ view }: { view: FinanceView }) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [isLoading, setIsLoading] = useState(view === "receivables");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view !== "receivables") return;
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error("Silakan login untuk membuka piutang.");
        const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("is_active", true).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        const { data, error: invoiceError } = await supabase.from("rental_invoices").select("id, invoice_number, billing_period_start, billing_period_end, issue_date, due_date, total_amount, amount_paid, currency, status, customers(name)").eq("organization_id", membership.organization_id).order("issue_date", { ascending: false }).limit(500);
        if (invoiceError) throw invoiceError;
        if (!cancelled) setInvoices((data || []) as unknown as InvoiceRow[]);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Piutang rental gagal dimuat.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [view]);

  const totalReceivable = invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_amount) - Number(invoice.amount_paid)), 0);
  const viewTitle = view === "receivables" ? "Piutang" : view === "payables" ? "Hutang" : "Pembayaran";

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="KEUANGAN" title={viewTitle} description="Supply-chain revenue dan rental revenue dipisahkan berdasarkan domain transaksi." />
        <nav aria-label="Modul keuangan" className="mb-5 flex gap-5 overflow-x-auto border-b border-line">
          {[["receivables", "Piutang"], ["payables", "Hutang"], ["payments", "Pembayaran"]].map(([href, label]) => <Link key={href} href={`/finance/${href}`} aria-current={view === href ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${view === href ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-ink"}`}>{label}</Link>)}
        </nav>
        {view === "receivables" ? (
          <>
            {error && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Piutang rental tidak dapat dimuat: {error}</p>}
            <div className="mb-5 grid gap-3 sm:grid-cols-2"><div className="border-b border-line py-3"><p className="text-sm text-slate-500">Sisa piutang rental</p><p className="mt-1 text-2xl font-semibold tabular text-ink">{formatCurrency(totalReceivable)}</p></div><div className="border-b border-line py-3"><p className="text-sm text-slate-500">Invoice rental</p><p className="mt-1 text-2xl font-semibold tabular text-ink">{invoices.length}</p></div></div>
            {isLoading ? <div className="flex h-48 items-center justify-center text-sm text-slate-500">Memuat invoice...</div> : !error && invoices.length === 0 ? <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-slate-500">Belum ada invoice rental. Supply-chain receivable belum tersedia di schema aktif.</div> : invoices.length > 0 ? <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600"><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Terbit / jatuh tempo</th><th className="px-4 py-3 text-right">Nilai</th><th className="px-4 py-3 text-right">Terbayar</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-line">{invoices.map((invoice) => <tr key={invoice.id}><td className="px-4 py-3 font-mono text-sm">{invoice.invoice_number}</td><td className="px-4 py-3 text-sm">{invoice.customers?.name || "-"}<span className="block text-xs text-slate-500">Rental</span></td><td className="px-4 py-3 text-sm">{formatDate(invoice.issue_date)}<span className="block text-xs text-slate-500">Jatuh tempo {formatDate(invoice.due_date)}</span></td><td className="px-4 py-3 text-right text-sm">{formatCurrency(Number(invoice.total_amount), invoice.currency)}</td><td className="px-4 py-3 text-right text-sm">{formatCurrency(Number(invoice.amount_paid), invoice.currency)}</td><td className="px-4 py-3"><StatusBadge tone={invoice.status === "PAID" ? "success" : invoice.status === "OVERDUE" ? "danger" : "warning"}>{invoice.status}</StatusBadge></td></tr>)}</tbody></table></div> : null}
          </>
        ) : (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-6"><h2 className="font-semibold text-amber-950">Sumber data belum tersedia</h2><p className="mt-2 text-sm text-amber-900">{view === "payables" ? "Schema repository belum menyediakan supplier invoices atau tabel AP." : "Schema repository belum menyediakan payment ledger untuk pencatatan dan rekonsiliasi pembayaran."} Tidak ada transaksi keuangan dummy yang ditampilkan.</p><Link href="/rental/billing" className="mt-4 inline-flex"><Button variant="secondary">Buka rental billing</Button></Link></section>
        )}
      </div>
    </AppShell>
  );
}