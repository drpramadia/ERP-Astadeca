"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/utils";

interface BillingInvoice {
  id: string;
  invoice_number: string;
  contract_id: string;
  billing_period_start: string;
  billing_period_end: string;
  total_amount: number;
  status: string;
  due_date?: string;
  notes?: string;
  created_at: string;
  rental_contracts?: { contract_number: string; title: string };
}

interface ContractOption {
  id: string;
  contract_number: string;
  title: string;
  rental_contracts_customer_fk?: { name: string } | { name: string }[];
}

interface BillingForm {
  contractId: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: string;
  dueDate: string;
  notes: string;
}

const blankForm: BillingForm = {
  contractId: "",
  periodStart: "",
  periodEnd: "",
  totalAmount: "",
  dueDate: "",
  notes: "",
};

export default function BillingPage() {
  const { userId, loaded } = useSession();
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<BillingForm>(blankForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded || !userId) return;
    async function init() {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getClaims();
      const claims = claimsData?.claims;
      if (!claims) return;
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", claims.sub)
        .eq("is_active", true)
        .maybeSingle();
      if (!membership) return;

      const [invRes, conRes] = await Promise.all([
        supabase
          .from("rental_billing_invoices")
          .select("*, rental_contracts(contract_number, title)")
          .eq("organization_id", membership.organization_id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("rental_contracts")
          .select("id, contract_number, title, rental_contracts_customer_fk(name)")
          .eq("organization_id", membership.organization_id)
          .eq("status", "ACTIVE")
          .order("contract_number"),
      ]);
      setInvoices((invRes.data || []) as BillingInvoice[]);
      setContracts((conRes.data || []) as ContractOption[]);
    }
    void init().finally(() => setIsLoading(false));
  }, [loaded, userId]);

  async function handleCreate() {
    if (!form.contractId || !form.periodStart || !form.periodEnd || !form.totalAmount) {
      setError("Lengkapi semua field wajib.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getClaims();
      const claims = claimsData?.claims;
      if (!claims) throw new Error("Not authenticated");

      // Get org_id
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", claims.sub)
        .eq("is_active", true)
        .maybeSingle();
      if (!membership) throw new Error("Tidak ada keanggotaan organisasi aktif.");

      const orgId = membership.organization_id;

      // Get next invoice number via RPC
      const { data: invNum } = await supabase.rpc("get_next_number", {
        p_org_id: orgId,
        p_doc_type: "INV",
      });
      const invoiceNumber = (invNum as string) || `INV-${new Date().getFullYear()}-000001`;

      const { error: insertError } = await supabase.from("rental_billing_invoices").insert({
        organization_id: orgId,
        contract_id: form.contractId,
        invoice_number: invoiceNumber,
        billing_period_start: form.periodStart,
        billing_period_end: form.periodEnd,
        total_amount: parseFloat(form.totalAmount),
        status: "DRAFT",
        due_date: form.dueDate || null,
        notes: form.notes || null,
        created_by: claims.sub,
      });
      if (insertError) throw insertError;

      setMessage("Invoice billing berhasil dibuat.");
      setShowCreate(false);
      setForm(blankForm);
      window.location.reload();
    } catch (e: any) {
      setError(e?.message || "Gagal membuat invoice.");
    } finally {
      setIsSaving(false);
    }
  }

  const statusLabels: Record<string, { label: string; tone: string }> = {
    DRAFT: { label: "Draft", tone: "bg-slate-100 text-slate-700" },
    SENT: { label: "Terkirim", tone: "bg-blue-100 text-blue-700" },
    PAID: { label: "Lunas", tone: "bg-emerald-100 text-emerald-700" },
    OVERDUE: { label: "Jatuh Tempo", tone: "bg-red-100 text-red-700" },
    CANCELLED: { label: "Batal", tone: "bg-slate-100 text-slate-500" },
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="COLD STORAGE RENTAL"
          title="Billing"
          description="Kelola invoice penagihan sewa cold storage per periode."
          actions={
            <Button variant="primary" size="sm" onClick={() => { setShowCreate(true); setError(null); setMessage(null); }}>
              + Invoice Baru
            </Button>
          }
        />
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-500">Memuat invoice...</div>
        ) : invoices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-sm text-slate-500">Belum ada invoice billing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">No. Invoice</th>
                  <th className="px-4 py-3">Kontrak</th>
                  <th className="px-4 py-3">Periode</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Jatuh Tempo</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => {
                  const st = statusLabels[inv.status] || { label: inv.status, tone: "bg-slate-100 text-slate-700" };
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-sm font-medium">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-sm">
                        <p className="font-medium">{inv.rental_contracts?.contract_number || "—"}</p>
                        <p className="text-xs text-slate-500">{inv.rental_contracts?.title || ""}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatDate(inv.billing_period_start)} – {formatDate(inv.billing_period_end)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                        Rp {inv.total_amount.toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {inv.due_date ? formatDate(inv.due_date) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Invoice Billing Baru" size="md">
        <form onSubmit={(e) => { e.preventDefault(); void handleCreate(); }} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Kontrak Aktif *</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={form.contractId}
              onChange={(e) => setForm((f) => ({ ...f, contractId: e.target.value }))}
              required
            >
              <option value="">Pilih kontrak...</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contract_number} · {c.title} ({Array.isArray(c.rental_contracts_customer_fk) ? c.rental_contracts_customer_fk[0]?.name : c.rental_contracts_customer_fk?.name || "—"})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Periode Mulai *</label>
              <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Periode Selesai *</label>
              <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Total Amount (Rp) *</label>
              <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.totalAmount} onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))}
                placeholder="0" min="0" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Jatuh Tempo</label>
              <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3}
              value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Opsional" />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Batal</Button>
            <Button type="submit" loading={isSaving}>Simpan Draft</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
