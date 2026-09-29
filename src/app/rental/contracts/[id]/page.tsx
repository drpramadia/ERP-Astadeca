"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";

interface ContractDetail {
  id: string;
  contract_number: string;
  title: string;
  description?: string;
  status: string;
  start_date: string;
  end_date?: string;
  billing_frequency: string;
  payment_terms_days: number;
  notes?: string;
  approved_at?: string;
  created_at: string;
  customers?: { name: string; code: string; phone?: string; email?: string };
  cold_storages?: { name: string; code: string };
  profiles?: { full_name: string | null };
}

interface Allocation {
  id: string;
  allocation_number: string;
  active_quantity_kg: number;
  released_quantity_kg: number;
  status: string;
  products?: { name: string; sku?: string };
  storage_locations?: { code: string; name: string };
  batches?: { batch_number: string };
}

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = params.id as string;

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeciding, setIsDeciding] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: claims } = await supabase.auth.getClaims();
      const userId = (claims?.claims as { sub?: string })?.sub;
      if (!userId) return;

      const { data: memb } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", userId).eq("is_active", true).maybeSingle();
      if (!memb) return;

      const [{ data: cData, error: cErr }, { data: aData, error: aErr }] = await Promise.all([
        supabase
          .from("rental_contracts")
          .select(`*, customers(name, code), cold_storages(name, code), profiles(full_name)`)
          .eq("id", contractId)
          .eq("organization_id", memb.organization_id)
          .single(),
        supabase
          .from("rental_allocations")
          .select(`*, products(name, sku), storage_locations(code, name), batches(batch_number)`)
          .eq("contract_id", contractId)
          .eq("organization_id", memb.organization_id)
          .order("created_at", { ascending: false }),
      ]);

      if (cErr) { setError(cErr.message); setIsLoading(false); return; }
      setContract(cData as unknown as ContractDetail);
      setAllocations((aData ?? []) as unknown as Allocation[]);
      setIsLoading(false);
    }
    void init();
  }, [contractId]);

  async function decide(decision: "approve" | "reject") {
    if (!(contract as any)?.approval_request_id) return;
    if (!confirm(`Yakin ingin ${decision === "approve" ? "menyetujui" : "menolak"} kontrak ini?`)) return;
    setIsDeciding(true);
    const supabase = createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = (claims?.claims as { sub?: string })?.sub;
    const { error: err } = await supabase.rpc("decide_approval_request", {
      p_approval_request_id: (contract as any).approval_request_id,
      p_action: decision === "approve" ? "APPROVE" : "REJECT",
      p_comment: decision === "approve" ? "Disetujui." : "Ditolak.",
      p_actor_user_id: userId,
    });
    setIsDeciding(false);
    if (err) {
      setError(err.message);
    } else {
      router.refresh();
      window.location.reload();
    }
  }

  async function activate() {
    if (!confirm("Aktifkan kontrak ini? Setelah diaktifkan, kontrak tidak dapat diubah.")) return;
    setIsDeciding(true);
    const supabase = createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = (claims?.claims as { sub?: string })?.sub;
    const { error: err } = await supabase.rpc("activate_rental_contract", {
      p_contract_id: contractId,
      p_performed_by: userId,
    });
    setIsDeciding(false);
    if (err) {
      setError(err.message);
    } else {
      router.refresh();
      window.location.reload();
    }
  }

  const freqLabel: Record<string, string> = {
    DAILY: "Harian", WEEKLY: "Mingguan", MONTHLY: "Bulanan", QUARTERLY: "Triwulanan",
  };
  const statusTone = (s: string): "neutral" | "success" | "warning" | "danger" | "info" => {
    if (["ACTIVE", "APPROVED"].includes(s)) return "success";
    if (s === "PENDING_APPROVAL") return "warning";
    if (["CANCELLED", "REJECTED"].includes(s)) return "danger";
    return "neutral";
  };
  const totalIn = allocations.reduce((s, a) => s + Number(a.active_quantity_kg || 0), 0);
  const totalReleased = allocations.reduce((s, a) => s + Number(a.released_quantity_kg || 0), 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><span className="text-sm text-slate-500">Memuat...</span></div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        ) : contract ? (
          <>
            <div className="mb-6">
              <button onClick={() => router.back()} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-primary transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Kembali
              </button>
              <PageHeader
                eyebrow="KONTRAK SEWA"
                title={contract.contract_number}
                description={contract.title}
              />
            </div>

            {/* Action buttons */}
            <div className="mb-6 flex flex-wrap gap-3">
              {contract.status === "PENDING_APPROVAL" && (
                <>
                  <Button onClick={() => decide("approve")} disabled={isDeciding} className="bg-success hover:bg-success/90">
                    ✓ Setujui Kontrak
                  </Button>
                  <Button onClick={() => decide("reject")} variant="secondary" disabled={isDeciding}>
                    ✗ Tolak Kontrak
                  </Button>
                </>
              )}
              {contract.status === "APPROVED" && (
                <Button onClick={activate} disabled={isDeciding} className="bg-primary hover:bg-primary/90">
                  Aktifkan Kontrak
                </Button>
              )}
            </div>

            {/* Contract info */}
            <div className="mb-8 rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Detail Kontrak</h2>
                <StatusBadge tone={statusTone(contract.status)}>{contract.status.replace("_", " ")}</StatusBadge>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Customer", contract.customers?.name || "—"],
                  ["Kode Customer", contract.customers?.code || "—"],
                  ["Cold Storage", contract.cold_storages?.name || "—"],
                  ["Periode", `${new Date(contract.start_date).toLocaleDateString("id-ID")}${contract.end_date ? ` – ${new Date(contract.end_date).toLocaleDateString("id-ID")}` : " (berkelanjutan)"}`],
                  ["Billing", freqLabel[contract.billing_frequency] || contract.billing_frequency],
                  ["Termin Bayar", `${contract.payment_terms_days} hari`],
                  ["Dibuat", new Date(contract.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })],
                  ["Notes", contract.notes || "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-slate-500">{label}</dt>
                    <dd className="mt-1 text-sm font-medium text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Allocations summary */}
            <div className="mb-8 rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-ink">Barang di Kontrak</h2>
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <p className="text-xs text-emerald-600 font-medium">Total Item</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700">{allocations.length}</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
                  <p className="text-xs text-blue-600 font-medium">kg Tersimpan</p>
                  <p className="mt-1 text-xl font-bold text-blue-700">{totalIn.toLocaleString("id-ID")}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-xs text-amber-600 font-medium">kg Released</p>
                  <p className="mt-1 text-xl font-bold text-amber-700">{totalReleased.toLocaleString("id-ID")}</p>
                </div>
              </div>

              {allocations.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">Belum ada barang di kontrak ini.</p>
              ) : (
                <div className="rounded-xl border border-line overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-slate-50">
                        {["Allocation", "Produk", "Lokasi", "Batch", "Kg Aktif", "Kg Released", "Status"].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map(a => (
                        <tr key={a.id} className="border-b border-line last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{a.allocation_number}</td>
                          <td className="px-4 py-2.5">{a.products?.name || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{a.storage_locations?.code || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{a.batches?.batch_number || "—"}</td>
                          <td className="px-4 py-2.5 font-medium">{Number(a.active_quantity_kg || 0).toLocaleString("id-ID")} kg</td>
                          <td className="px-4 py-2.5 text-amber-600">{Number(a.released_quantity_kg || 0).toLocaleString("id-ID")} kg</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              a.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" :
                              a.status === "PARTIALLY_RELEASED" ? "bg-amber-50 text-amber-700" :
                              "bg-slate-100 text-slate-500"
                            }`}>{a.status.replace("_", " ")}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
