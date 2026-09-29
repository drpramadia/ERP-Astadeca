"use client";

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
import { formatDate } from "@/lib/utils";

interface RentalContract {
  id: string;
  customer_id: string;
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
  cold_storage_id?: string;
  // embedded relation
  rental_contracts_customer_fkey?: { name: string; code: string };
}

interface RentalCustomer {
  id: string;
  code: string;
  name: string;
}

interface RentalColdStorage {
  id: string;
  code: string;
  name: string;
}

interface ContractForm {
  customerId: string;
  coldStorageId: string;
  title: string;
  startDate: string;
  endDate: string;
  totalCapacityKg: string;
  billingFrequency: string;
  paymentTermsDays: string;
  notes: string;
}

const blankForm: ContractForm = {
  customerId: "", coldStorageId: "", title: "",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "", totalCapacityKg: "",
  billingFrequency: "MONTHLY", paymentTermsDays: "30", notes: "",
};

export default function RentalContractsPage() {
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [customers, setCustomers] = useState<RentalCustomer[]>([]);
  const [coldStorages, setColdStorages] = useState<RentalColdStorage[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RentalContract | null>(null);
  const [details, setDetails] = useState<RentalContract | null>(null);
  const [form, setForm] = useState<ContractForm>(blankForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadContracts(orgId: string) {
    const { data, error: queryError } = await createClient()
      .from("rental_contracts")
      .select("*, rental_contracts_customer_fkey(name, code), approval_request_id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (queryError) throw queryError;
    setContracts((data || []) as RentalContract[]);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getClaims();
        const userId = claimsData?.claims?.sub;
        if (!userId) throw new Error("Silakan login untuk mengelola kontrak rental.");
        const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("is_active", true).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        const [customerResult, coldResult, permissionResult] = await Promise.all([
          supabase.from("customers").select("id, code, name").eq("organization_id", membership.organization_id).eq("active", true).eq("is_rental_customer", true).order("name"),
          supabase.from("cold_storages").select("id, code, name").eq("organization_id", membership.organization_id).eq("status", "ACTIVE").order("code"),
          supabase.rpc("has_org_permission", { p_org_id: membership.organization_id, p_permission_code: "rental.manage" }),
        ]);
        if (customerResult.error) throw customerResult.error;
        if (coldResult.error) throw coldResult.error;
        if (permissionResult.error) throw permissionResult.error;
        if (!cancelled) {
          setOrganizationId(membership.organization_id);
          setActorId(userId);
          setCustomers((customerResult.data || []) as RentalCustomer[]);
          setColdStorages((coldResult.data || []) as RentalColdStorage[]);
          setCanManage(Boolean(permissionResult.data));
          await loadContracts(membership.organization_id);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat kontrak rental.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void init();
    return () => { cancelled = true; };
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...blankForm, customerId: customers[0]?.id || "", coldStorageId: coldStorages[0]?.id || "" });
    setError(null);
    setMessage(null);
    setIsEditorOpen(true);
  }

  function openEdit(contract: RentalContract) {
    setEditing(contract);
    setForm({
      customerId: contract.customer_id,
      coldStorageId: "",
      title: contract.title,
      startDate: contract.start_date,
      endDate: contract.end_date || "",
      totalCapacityKg: "",
      billingFrequency: contract.billing_frequency,
      paymentTermsDays: String(contract.payment_terms_days),
      notes: contract.notes || "",
    });
    setError(null);
    setIsEditorOpen(true);
  }

  async function saveContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !actorId) return;
    setIsSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      // Order MUST match the DB RPC signature:
      // p_organization_id, p_customer_id, p_cold_storage_id, p_title,
      // p_start_date, p_end_date, p_total_capacity_kg, p_billing_frequency,
      // p_payment_terms_days, p_notes, p_performed_by
      const values = {
        p_organization_id: organizationId,
        p_customer_id: form.customerId,
        p_cold_storage_id: form.coldStorageId || null,
        p_title: form.title.trim(),
        p_start_date: form.startDate,
        p_end_date: form.endDate || null,
        p_total_capacity_kg: form.totalCapacityKg ? Number(form.totalCapacityKg) : null,
        p_billing_frequency: form.billingFrequency,
        p_payment_terms_days: Number(form.paymentTermsDays),
        p_notes: form.notes || null,
        p_performed_by: actorId,
      };
      if (editing) {
        const { error: updateError } = await supabase.rpc("update_rental_contract_draft", {
          p_contract_id: editing.id,
          p_title: values.p_title,
          p_start_date: values.p_start_date,
          p_end_date: values.p_end_date,
          p_billing_frequency: values.p_billing_frequency,
          p_payment_terms_days: values.p_payment_terms_days,
          p_notes: values.p_notes,
          p_performed_by: values.p_performed_by,
        });
        if (updateError) throw updateError;
        setMessage("Draft kontrak diperbarui.");
      } else {
        const { error: createError } = await supabase.rpc("create_rental_contract", values);
        if (createError) throw createError;
        setMessage("Draft kontrak dibuat.");
      }
      setIsEditorOpen(false);
      await loadContracts(organizationId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kontrak gagal disimpan.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitContract(contract: RentalContract) {
    if (!actorId || !organizationId) return;
    setIsSaving(true);
    setError(null);
    try {
      const { error: submitError } = await createClient().rpc("submit_rental_contract", {
        p_contract_id: contract.id,
        p_performed_by: actorId,
      });
      if (submitError) throw submitError;
      setMessage(`${contract.contract_number} dikirim untuk approval Director.`);
      await loadContracts(organizationId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kontrak gagal dikirim.");
    } finally {
      setIsSaving(false);
    }
  }

  async function activateContract(contract: RentalContract) {
    if (!actorId || !organizationId) return;
    setIsSaving(true);
    setError(null);
    try {
      const { error: activateError } = await createClient().rpc("activate_rental_contract", {
        p_contract_id: contract.id,
        p_performed_by: actorId,
      });
      if (activateError) throw activateError;
      setMessage(`${contract.contract_number} aktif.`);
      await loadContracts(organizationId);
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Kontrak gagal diaktifkan.");
    } finally {
      setIsSaving(false);
    }
  }

  async function decideContract(contract: RentalContract, action: "approve" | "reject") {
    if (!actorId || !organizationId) return;
    setIsSaving(true);
    setError(null);
    try {
      const { error: decideError } = await createClient().rpc("decide_approval_request", {
        p_approval_request_id: contract.approval_request_id,
        p_action: action === "approve" ? "APPROVE" : "REJECT",
        p_comment: action === "approve" ? "Disetujui." : "Ditolak.",
        p_actor_user_id: actorId,
      } as Record<string, unknown>);
      if (decideError) throw decideError;
      setMessage(`${contract.contract_number} ${action === "approve" ? "disetujui" : "ditolak"}.`);
      await loadContracts(organizationId);
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Persetujuan gagal diproses.");
    } finally {
      setIsSaving(false);
    }
  }

  const statusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    SUBMITTED: { label: "Submitted", tone: "warning" },
    PENDING_APPROVAL: { label: "Menunggu Approval", tone: "warning" },
    APPROVED: { label: "Disetujui", tone: "info" },
    ACTIVE: { label: "Aktif", tone: "success" },
    SUSPENDED: { label: "Ditunda", tone: "danger" },
    COMPLETED: { label: "Selesai", tone: "success" },
    CANCELLED: { label: "Dibatalkan", tone: "danger" },
  };

  const frequencyLabels: Record<string, string> = {
    DAILY: "Harian",
    WEEKLY: "Mingguan",
    MONTHLY: "Bulanan",
    QUARTERLY: "Kuartalan",
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="COLD STORAGE RENTAL"
          title="Kontrak Sewa"
          description="Kelola kontrak sewa cold storage pelanggan."
          actions={
            <Button variant="primary" size="sm" onClick={openCreate} disabled={!canManage}>Buat Kontrak Baru</Button>
          }
        />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : contracts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada kontrak sewa</h3>
            <p className="mt-2 text-sm text-slate-500">
              Kontrak sewa cold storage akan muncul di sini.
            </p>
            <Button variant="primary" className="mt-4" onClick={openCreate} disabled={!canManage}>Buat Kontrak Baru</Button>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor Kontrak</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Pelanggan</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Judul</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Periode</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Tagihan</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {contracts.map((contract) => {
                    const statusInfo = statusOptions[contract.status] || { label: contract.status, tone: "neutral" as const };
                    return (
                      <tr key={contract.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{contract.contract_number}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink">{contract.rental_contracts_customer_fkey?.name || "−"}</p>
                          <p className="text-xs text-slate-500">{contract.rental_contracts_customer_fkey?.code || "−"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{contract.title}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-ink">{formatDate(contract.start_date)} - {contract.end_date ? formatDate(contract.end_date) : "Sekarang"}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-500">
                          {frequencyLabels[contract.billing_frequency] || contract.billing_frequency}
                          <br />
                          <span className="text-xs">{contract.payment_terms_days} hari</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button type="button" onClick={() => setDetails(contract)} className="text-xs font-medium text-primary hover:underline">Lihat</button>
                            {contract.status === "DRAFT" && (
                              <button type="button" onClick={() => openEdit(contract)} className="text-xs font-medium text-slate-500 hover:underline">Edit</button>
                            )}
                            {contract.status === "DRAFT" && <button type="button" onClick={() => void submitContract(contract)} disabled={!canManage || isSaving} className="text-xs font-medium text-primary hover:underline">Submit</button>}
                            {contract.status === "PENDING_APPROVAL" && <button type="button" onClick={() => void decideContract(contract, "approve")} disabled={isSaving} className="text-xs font-medium text-success hover:underline">Approve</button>}
                            {contract.status === "PENDING_APPROVAL" && <button type="button" onClick={() => void decideContract(contract, "reject")} disabled={isSaving} className="text-xs font-medium text-danger hover:underline">Reject</button>}
                            {contract.status === "APPROVED" && <button type="button" onClick={() => void activateContract(contract)} disabled={!canManage || isSaving} className="text-xs font-medium text-success hover:underline">Aktifkan</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <Modal isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} title={editing ? "Edit draft kontrak" : "Buat kontrak rental"} size="lg">
        <form onSubmit={(event) => void saveContract(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Customer rental" required options={[{ value: "", label: "Pilih customer" }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))]} value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))} />
            <Select label="Cold storage" options={[{ value: "", label: "Semua cold storage" }, ...coldStorages.map((cs) => ({ value: cs.id, label: `${cs.code} · ${cs.name}` }))]} value={form.coldStorageId} onChange={(event) => setForm((current) => ({ ...current, coldStorageId: event.target.value }))} />
            <Input label="Judul kontrak" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            <Input label="Kapasitas maksimal (kg)" type="number" min="0" value={form.totalCapacityKg} onChange={(event) => setForm((current) => ({ ...current, totalCapacityKg: event.target.value }))} placeholder="Opsional" />
            <Input label="Tanggal mulai" type="date" required value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
            <Input label="Tanggal selesai" type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} />
            <Select label="Frekuensi billing" options={[{ value: "DAILY", label: "Harian" }, { value: "WEEKLY", label: "Mingguan" }, { value: "MONTHLY", label: "Bulanan" }, { value: "QUARTERLY", label: "Kuartalan" }]} value={form.billingFrequency} onChange={(event) => setForm((current) => ({ ...current, billingFrequency: event.target.value }))} />
            <Input label="Termin pembayaran (hari)" type="number" min="0" step="1" value={form.paymentTermsDays} onChange={(event) => setForm((current) => ({ ...current, paymentTermsDays: event.target.value }))} />
            <div className="sm:col-span-2"><Textarea label="Catatan" rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" onClick={() => setIsEditorOpen(false)}>Batal</Button><Button type="submit" loading={isSaving} disabled={!canManage}>{editing ? "Simpan perubahan" : "Simpan draft"}</Button></div>
        </form>
      </Modal>
      <Modal isOpen={details !== null} onClose={() => setDetails(null)} title={details?.contract_number || "Detail kontrak"} size="lg">
        {details && <dl className="grid gap-3 sm:grid-cols-2">{[["Customer", details.rental_contracts_customer_fkey?.name || "−"], ["Judul", details.title], ["Status", details.status], ["Mulai", formatDate(details.start_date)], ["Selesai", details.end_date ? formatDate(details.end_date) : "Tidak ditentukan"], ["Billing", frequencyLabels[details.billing_frequency] || details.billing_frequency], ["Termin", `${details.payment_terms_days} hari`], ["Catatan", details.notes || "−"]].map(([label, value]) => <div key={label} className="border-b border-line pb-2"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm text-ink">{value}</dd></div>)}</dl>}
      </Modal>
    </AppShell>
  );
}