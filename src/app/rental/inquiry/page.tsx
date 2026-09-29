"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";

interface Inquiry {
  id: string;
  inquiry_number: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  product_type?: string;
  estimated_quantity_kg?: number;
  estimated_duration_days?: number;
  notes?: string;
  status: "BARU" | "DIFOLLOWUP" | "DEAL" | "GAGAL" | "CLOSED";
  created_by?: string;
  created_at: string;
  profiles?: { full_name: string | null };
}

interface FormData {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  productType: string;
  estimatedQtyKg: string;
  estimatedDuration: string;
  notes: string;
}

const blankForm: FormData = {
  customerName: "", customerPhone: "", customerEmail: "",
  productType: "", estimatedQtyKg: "", estimatedDuration: "", notes: "",
};

const STATUS_OPTS = [
  { value: "BARU", label: "Baru" },
  { value: "DIFOLLOWUP", label: "Di-follow-up" },
  { value: "DEAL", label: "Deal" },
  { value: "GAGAL", label: "Gagal" },
  { value: "CLOSED", label: "Closed" },
];

const STATUS_COLORS: Record<string, string> = {
  BARU:       "bg-blue-50 text-blue-700 border-blue-200",
  DIFOLLOWUP: "bg-amber-50 text-amber-700 border-amber-200",
  DEAL:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  GAGAL:      "bg-red-50 text-red-700 border-red-200",
  CLOSED:     "bg-slate-100 text-slate-500 border-slate-200",
};

export default function InquiryPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormData>(blankForm);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) return;

    const { data: memb } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", userId).eq("is_active", true).maybeSingle();
    if (!memb) return;

    setOrgId(memb.organization_id);
    setActorId(userId);

    const { data } = await supabase
      .from("rental_inquiries")
      .select("*, profiles!rental_inquiries_created_by_fkey(full_name)")
      .eq("organization_id", memb.organization_id)
      .order("created_at", { ascending: false });

    setInquiries((data ?? []) as Inquiry[]);
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !actorId) return;
    setIsSaving(true);
    setErr(null);
    setMsg(null);

    const supabase = createClient();
    const { data: numData } = await supabase.rpc("generate_inquiry_number", { p_org_id: orgId });
    const inquiryNumber: string = (numData as string) ?? `INQ-${Date.now()}`;

    const { data, error } = await supabase.from("rental_inquiries").insert({
      organization_id: orgId,
      inquiry_number: inquiryNumber,
      customer_name: form.customerName,
      customer_phone: form.customerPhone || null,
      customer_email: form.customerEmail || null,
      product_type: form.productType || null,
      estimated_quantity_kg: form.estimatedQtyKg ? Number(form.estimatedQtyKg) : null,
      estimated_duration_days: form.estimatedDuration ? Number(form.estimatedDuration) : null,
      notes: form.notes || null,
      status: "BARU",
      created_by: actorId,
    }).select().single();

    setIsSaving(false);
    if (error) { setErr(error.message); return; }
    setMsg("Inquiry berhasil dicatat.");
    setForm(blankForm);
    setShowCreate(false);
    void load();
  }

  async function handleStatus(inq: Inquiry, newStatus: string) {
    const supabase = createClient();
    await supabase.from("rental_inquiries").update({ status: newStatus }).eq("id", inq.id);
    void load();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="COLD STORAGE"
          title="Inquiry"
        />

        {msg && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</div>}
        {err && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}

        {/* Table */}
        <div className="rounded-2xl border border-line bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Inquiry#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estimasi</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Produk</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Memuat...</td></tr>
              ) : inquiries.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Belum ada inquiry. Catat inquiry pertama.</td></tr>
              ) : inquiries.map((inq) => (
                <tr key={inq.id} className="border-b border-line last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{inq.inquiry_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{inq.customer_name}</p>
                    {inq.customer_phone && <p className="text-xs text-slate-500">{inq.customer_phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {inq.estimated_quantity_kg ? `${Number(inq.estimated_quantity_kg).toLocaleString("id-ID")} kg` : "-"}
                    {inq.estimated_duration_days ? ` / ${inq.estimated_duration_days} hari` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{inq.product_type || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inq.status] || ""}`}>
                      {inq.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(inq.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-slate-600 hover:border-primary/50 cursor-pointer"
                      value={inq.status}
                      onChange={(e) => handleStatus(inq, e.target.value)}
                    >
                      {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Create modal */}
        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Catat Inquiry Baru">
          <form onSubmit={handleCreate} className="space-y-4">
            <Input label="Nama Customer" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} required placeholder="Nama lengkap atau perusahaan" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Telepon" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} placeholder="08xxxxxxxxxx" />
              <Input label="Email" type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} placeholder="email@example.com" />
            </div>
            <Input label="Jenis Produk" value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })} placeholder="Contoh: Daging sapi, Ikan tuna, Sayuran" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Estimasi Kuantitas (kg)" type="number" value={form.estimatedQtyKg} onChange={(e) => setForm({ ...form, estimatedQtyKg: e.target.value })} placeholder="0" />
              <Input label="Estimasi Durasi (hari)" type="number" value={form.estimatedDuration} onChange={(e) => setForm({ ...form, estimatedDuration: e.target.value })} placeholder="30" />
            </div>
            <Textarea label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Catatan atau pertanyaan dari customer..." />
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Batal</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Menyimpan..." : "Simpan Inquiry"}</Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
