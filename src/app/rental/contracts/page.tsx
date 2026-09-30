"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/use-permissions";

interface RentalContract {
  id: string;
  contract_number: string;
  title: string;
  status: string;
  start_date: string;
  end_date?: string;
  billing_frequency: string;
  payment_terms_days: number;
  created_at: string;
  notes?: string | null;
  approval_request_id?: string;
  rental_contracts_customer_fkey?: { name: string; code: string };
}

interface RentalCustomer { id: string; code: string; name: string; }

interface ContractForm {
  customerId: string;
  title: string;
  startDate: string;
  durationDays: string;
  billingFrequency: string;
  paymentTermsDays: string;
  notes: string;
}

const blankForm: ContractForm = {
  customerId: "", title: "",
  startDate: new Date().toISOString().slice(0, 10),
  durationDays: "30",
  billingFrequency: "MONTHLY", paymentTermsDays: "30", notes: "",
};

const BILLING_OPTS = [
  { value: "DAILY", label: "Harian" },
  { value: "WEEKLY", label: "Mingguan" },
  { value: "MONTHLY", label: "Bulanan" },
  { value: "QUARTERLY", label: "3 Bulanan" },
];

const STATUS_TONE: Record<string, "neutral"|"success"|"warning"|"danger"|"info"> = {
  DRAFT: "neutral", SUBMITTED: "info", PENDING_APPROVAL: "warning",
  APPROVED: "info", ACTIVE: "success", SUSPENDED: "warning",
  COMPLETED: "neutral", CANCELLED: "danger", REJECTED: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", PENDING_APPROVAL: "Menunggu Approval",
  APPROVED: "Disetujui", ACTIVE: "Aktif", SUSPENDED: "Ditangguhkan",
  COMPLETED: "Selesai", CANCELLED: "Dibatalkan", REJECTED: "Ditolak",
};

export default function RentalContractsPage() {
  const { userId, loaded } = useSession();
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [customers, setCustomers] = useState<RentalCustomer[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<ContractForm>(blankForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function loadContracts(orgId: string) {
    createClient().from("rental_contracts")
      .select("*, rental_contracts_customer_fkey(name, code)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); return; }
        setContracts((data ?? []) as RentalContract[]);
        setIsLoading(false);
      });
  }

  useEffect(() => {
    if (!loaded || !userId) return;
    async function init() {
      const supabase = createClient();
      const { data: memb } = await supabase
        .from("organization_memberships").select("organization_id")
        .eq("user_id", userId).eq("is_active", true).maybeSingle();
      if (!memb) return;

      const [{ data: custData }, { data: permData }] = await Promise.all([
        supabase.from("customers").select("id, code, name")
          .eq("organization_id", memb.organization_id).eq("active", true)
          .eq("is_rental_customer", true).order("name"),
        supabase.rpc("has_org_permission", { p_org_id: memb.organization_id, p_permission_code: "rental.manage" }),
      ]);
      setCustomers((custData ?? []) as RentalCustomer[]);
      setCanManage(Boolean(permData));
      loadContracts(memb.organization_id);
    }
    void init();
  }, [loaded, userId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.customerId || !form.title.trim() || !form.startDate || !form.durationDays) {
      setError("Lengkapi semua field wajib."); return;
    }
    setIsSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: memb } = await supabase
      .from("organization_memberships").select("organization_id")
      .eq("user_id", userId).eq("is_active", true).maybeSingle();
    if (!memb) { setIsSaving(false); return; }

    const { error: err } = await supabase.rpc("create_rental_contract", {
      p_organization_id: memb.organization_id,
      p_customer_id: form.customerId,
      p_title: form.title.trim(),
      p_start_date: form.startDate,
      p_duration_days: Number(form.durationDays) || null,
      p_billing_frequency: form.billingFrequency,
      p_payment_terms_days: Number(form.paymentTermsDays) || 30,
      p_notes: form.notes || null,
    });
    setIsSaving(false);
    if (err) { setError("Gagal membuat kontrak: " + err.message); return; }
    setMessage("Kontrak berhasil dibuat. Menunggu persetujuan Director.");
    setForm(blankForm);
    setShowCreate(false);
    loadContracts(memb.organization_id);
  }

  async function handleSubmit(contract: RentalContract) {
    setIsSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    const userId = user?.id;
    if (!userId) { setIsSaving(false); setError("Sesi tidak valid."); return; }
    const { error: err } = await supabase.rpc("submit_rental_contract", {
      p_contract_id: contract.id,
      p_performed_by: userId,
    });
    setIsSaving(false);
    if (err) { setError("Gagal submit kontrak: " + err.message); return; }
    setMessage(`${contract.contract_number} dikirim untuk approval Director.`);
    const { data: memb2 } = await supabase
      .from("organization_memberships").select("organization_id")
      .eq("user_id", userId).eq("is_active", true).maybeSingle();
    if (memb2) loadContracts(memb2.organization_id);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="COLD STORAGE RENTAL"
          title="Kontrak Sewa"
          description="Kelola kontrak sewa cold storage. Semua kontrak memerlukan persetujuan Director."
          actions={canManage ? <Button onClick={() => setShowCreate(true)}>+ Buat Kontrak</Button> : undefined}
        />

        {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{message}</div>}
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

        {/* Contract list */}
        <div className="rounded-2xl border border-line bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                {["No. Kontrak","Customer","Judul","Periode","Billing","Status","Aksi"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Memuat...</td></tr>
              ) : contracts.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  {canManage ? "Belum ada kontrak. Buat kontrak pertama." : "Belum ada kontrak sewa."}
                </td></tr>
              ) : contracts.map(c => {
                const start = new Date(c.start_date).toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" });
                const end = c.end_date ? new Date(c.end_date).toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" }) : "Berkelanjutan";
                const freqMap: Record<string,string> = { DAILY:"Harian",WEEKLY:"Mingguan",MONTHLY:"Bulanan",QUARTERLY:"3 Bulanan" };
                return (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/rental/contracts/${c.id}} className="font-mono text-xs text-primary hover:underline font-medium">
                        {c.contract_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{c.rental_contracts_customer_fkey?.name || "—"}</p>
                      <p className="text-xs text-slate-500">{c.rental_contracts_customer_fkey?.code || ""}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.title}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{start} — {end}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-slate-600">{freqMap[c.billing_frequency] || c.billing_frequency}</span>
                      <span className="ml-1 text-slate-400">· {c.payment_terms_days}h</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={STATUS_TONE[c.status] || "neutral"}>
                        {STATUS_LABEL[c.status] || c.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/rental/contracts/${c.id}} className="text-xs text-primary hover:underline font-medium">
                          Detail →
                        </Link>
                        {c.status === "DRAFT" && canManage && (
                          <button type="button" onClick={() => void handleSubmit(c)} disabled={isSaving}
                            className="text-xs font-medium text-primary hover:underline disabled:opacity-50">
                            Submit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Create modal */}
        <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setError(null); setMessage(null); }}
          title="Buat Kontrak Sewa Baru" size="lg">
          <form onSubmit={handleCreate} className="space-y-5">
            <Select
              label="Customer"
              value={form.customerId}
              onChange={e => setForm({ ...form, customerId: e.target.value })}
              options={[{ value:"", label:"— Pilih customer —" }, ...customers.map(c => ({ value:c.id, label:`${c.name} [${c.code}]` }))]}
            />
            <Input
              label="Judul Kontrak"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Contoh: Sewa Cold Storage Daging Sapi - PT XYZ"
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Tanggal Mulai"
                type="date"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
                required
              />
              <Input
                label="Lama Sewa (hari)"
                type="number"
                value={form.durationDays}
                onChange={e => setForm({ ...form, durationDays: e.target.value })}
                placeholder="30"
                hint={`Tanggal selesai dihitung otomatis: ${form.startDate && form.durationDays ? (() => {
                  const d = new Date(form.startDate); d.setDate(d.getDate() + Number(form.durationDays));
                  return d.toLocaleDateString("id-ID", { day:"numeric",month:"long",year:"numeric" });
                })() : '—'}`}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Frekuensi Billing"
                value={form.billingFrequency}
                onChange={e => setForm({ ...form, billingFrequency: e.target.value })}
                options={BILLING_OPTS}
              />
              <Input
                label="Termin Pembayaran (hari)"
                type="number"
                value={form.paymentTermsDays}
                onChange={e => setForm({ ...form, paymentTermsDays: e.target.value })}
                placeholder="30"
              />
            </div>
            <Textarea
              label="Catatan"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Catatan tambahan..."
            />
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Batal</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Menyimpan..." : "Buat Kontrak"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
