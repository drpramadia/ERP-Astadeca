"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceivingItem {
  product_id: string | null;
  batch_number: string | null;
  quantity: number | null;
  actual_quantity: number | null;
  products?: { name: string } | null;
}

interface ChecklistData {
  packaging_condition?: string;
  temperature_reading?: number | null;
  temperature_note?: string;
  expiry_check?: string;
  appearance?: string;
  weight_match?: boolean;
  document_complete?: boolean;
  notes?: string;
  items?: Array<{
    item_name?: string;
    item_status?: string;
    item_notes?: string;
  }>;
}

interface QcRecord {
  id: string;
  qc_number: string;
  receiving_id: string | null;
  status: string | null;
  result: string | null;
  inspected_at: string | null;
  notes: string | null;
  created_at: string | null;
  checklist_data: ChecklistData | null;
  evidence_photos: string[] | null;
  receiving_records?: {
    receiving_number: string;
    receiving_items?: ReceivingItem[];
  } | null;
}

const statusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  ACCEPTED: { label: "Diterima", tone: "success" },
  PARTIAL_ACCEPT: { label: "Terima Sebagian", tone: "warning" },
  QUARANTINE: { label: "Quarantine", tone: "warning" },
  REJECTED: { label: "Ditolak", tone: "danger" },
  PASSED: { label: "Lulus", tone: "success" },
  FAILED: { label: "Gagal", tone: "danger" },
  PENDING: { label: "Menunggu", tone: "neutral" },
};

const resultOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  PASS: { label: "Pass", tone: "success" },
  FAIL: { label: "Fail", tone: "danger" },
  CONDITIONAL: { label: "Bersyarat", tone: "warning" },
  HOLD: { label: "Hold", tone: "neutral" },
};

// A decision is recorded with apply_qc_inspection(); only ACCEPTED/PASSED release
// the received goods into inventory, so the buttons only appear while PENDING.
const PENDING_STATUSES = ["PENDING"];

interface ReceivingGR {
  id: string;
  receiving_number: string;
  received_date: string;
  status: string;
  suppliers?: { name: string };
  purchase_orders?: { po_number: string };
}

export default function QcPage() {
  const [qc, setQc] = useState<QcRecord[]>([]);
  const [grWithoutQc, setGrWithoutQc] = useState<ReceivingGR[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [canDecide, setCanDecide] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<QcRecord | null>(null);
  const [formStatus, setFormStatus] = useState<"ACCEPTED" | "REJECTED" | "QUARANTINE">("ACCEPTED");
  const [formNotes, setFormNotes] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Checklist form state
  const [checklist, setChecklist] = useState<ChecklistData>({});

  const loadQc = useCallback(async (orgId: string) => {
    const supabase = createClient();
    const [qcRes, grRes] = await Promise.all([
      supabase
        .from("qc_inspections")
        .select(`
          id, qc_number, receiving_id, status, result, inspected_at, notes, created_at,
          checklist_data, evidence_photos,
          receiving_records(
            receiving_number,
            receiving_items(product_id, batch_number, quantity, actual_quantity, products!ri_product_fk(name))
          )
        `)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200),
      // GRs that don't have a QC inspection yet
      supabase
        .from("receiving_records")
        .select("id, receiving_number, received_date, status, suppliers(name), purchase_orders(po_number)")
        .eq("organization_id", orgId)
        .not("status", "eq", "CANCELLED")
        .order("received_date", { ascending: false })
        .limit(50),
    ]);

    if (qcRes.error) throw qcRes.error;

    // Filter GRs that have no QC inspection
    const qcReceivingIds = new Set(
      ((qcRes.data || []) as QcRecord[]).map(r => r.receiving_id).filter(Boolean)
    );
    const withoutQC = ((grRes.data || []) as ReceivingGR[]).filter(
      gr => gr.id && !qcReceivingIds.has(gr.id)
    );

    if (!cancelled) {
      setQc((qcRes.data || []) as unknown as QcRecord[]);
      setGrWithoutQc(withoutQC);
    }
    return (qcRes.data || []) as unknown as QcRecord[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData?.session?.user?.id;
        if (!currentUserId) throw new Error("Silakan login untuk membuka kendali mutu.");

        const { data: membership, error: membershipError } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", currentUserId)
          .eq("is_active", true)
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");

        const { data: mayDecide } = await supabase.rpc("has_org_permission", {
          p_org_id: membership.organization_id,
          p_permission_code: "inventory.receive",
        });

        const records = await loadQc(membership.organization_id);
        if (cancelled) return;
        setOrganizationId(membership.organization_id);
        setUserId(currentUserId);
        setCanDecide(Boolean(mayDecide));
        setQc(records);
        setIsLoading(false);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Gagal memuat data QC.");
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadQc]);

  async function handlePhotoUpload(event: FormEvent<HTMLInputElement>) {
    const files = event.currentTarget.files;
    if (!files || !organizationId) return;
    setUploading(true);
    const supabase = createClient();
    const uploaded: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `${organizationId}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from("qc-evidence")
        .upload(path, file, { upsert: false });
      if (error) {
        console.error("Upload error:", error.message);
        continue;
      }
      const { data: urlData } = supabase.storage
        .from("qc-evidence")
        .getPublicUrl(data.path);
      uploaded.push(urlData.publicUrl);
    }
    setPhotoUrls(prev => [...prev, ...uploaded]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openDecideModal(record: QcRecord, status: "ACCEPTED" | "REJECTED" | "QUARANTINE") {
    setSelectedRecord(record);
    setFormStatus(status);
    setFormNotes("");
    setPhotoUrls(record.evidence_photos || []);
    setChecklist(record.checklist_data || {});
  }

  async function handleCreateQc(grId: string) {
    if (!grId) return;
    setBusyId(grId);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("create_qc_from_receiving", {
        p_receiving_id: grId,
      });
      if (rpcError) throw rpcError;
      const newQcId = Array.isArray(data) ? data[0] : data;
      if (newQcId) {
        setNotice("QC berhasil dibuat. Silakan isi checklist dan simpan.");
        if (organizationId) await loadQc(organizationId);
        setSelectedRecord({
          id: newQcId as string,
          qc_number: "",
          receiving_id: grId,
          status: "PENDING",
          result: null,
          inspected_at: null,
          notes: null,
          created_at: new Date().toISOString(),
          checklist_data: null,
          evidence_photos: null,
          receiving_records: null,
        });
        setFormStatus("ACCEPTED");
        setFormNotes("");
        setPhotoUrls([]);
        setChecklist({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat QC.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitDecision(e: FormEvent) {
    e.preventDefault();
    if (!selectedRecord || !organizationId || !userId) return;
    setBusyId(selectedRecord.id);
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("apply_qc_inspection", {
        p_inspection_id: selectedRecord.id,
        p_status: formStatus,
        p_result: formStatus === "ACCEPTED" ? "PASS" : formStatus === "REJECTED" ? "FAIL" : "CONDITIONAL",
        p_notes: formNotes || null,
        p_performed_by: userId,
        p_checklist_data: checklist,
        p_evidence_photos: photoUrls,
      });
      if (rpcError) throw rpcError;
      const outcome = Array.isArray(data) ? data[0] : data;
      setNotice(outcome?.msg || "Keputusan QC tersimpan.");
      setSelectedRecord(null);
      setQc(await loadQc(organizationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan QC.");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = statusFilter
    ? qc.filter((r) => r.status === statusFilter)
    : qc;

  const statusCounts = qc.reduce<Record<string, number>>((acc, r) => {
    if (r.status) acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SUPPLY CHAIN"
          title="Kendali Mutu"
          description="Pemeriksaan kualitas barang saat penerimaan dan distribusi."
        />

        {/* Status summary */}
        {Object.keys(statusCounts).length > 0 && (
          <div className="mb-5 flex flex-wrap gap-3">
            <button
              onClick={() => setStatusFilter("")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === "" ? "border-primary bg-primary/10 text-primary" : "border-line bg-white text-slate-600 hover:border-slate-300"}`}
            >
              Semua ({qc.length})
            </button>
            {Object.entries(statusCounts).map(([status, count]) => {
              const info = statusOptions[status] || { label: status, tone: "neutral" as const };
              const toneClass = info.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : info.tone === "danger" ? "border-red-200 bg-red-50 text-red-700" : info.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700";
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(statusFilter === status ? "" : status)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === status ? "border-primary bg-primary/10 text-primary" : toneClass}`}
                >
                  {info.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* GRs that don't have a QC inspection yet */}
        {grWithoutQc.length > 0 && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-amber-800">
                GR Tanpa QC ({grWithoutQc.length})
              </h3>
              <span className="text-xs text-amber-600">
                Buat inspeksi QC untuk GR di bawah ini
              </span>
            </div>
            <div className="space-y-2">
              {grWithoutQc.slice(0, 5).map((gr) => (
                <div key={gr.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-mono font-medium text-ink">{gr.receiving_number}</p>
                    <p className="text-xs text-slate-500">
                      {gr.suppliers?.name || "—"} · {formatDate(gr.received_date)}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleCreateQc(gr.id)}
                    disabled={busyId === gr.id}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                  >
                    {busyId === gr.id ? "..." : "Buat QC"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">
            Memuat pemeriksaan kualitas...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-12 text-center text-sm text-slate-500">
            {statusFilter ? `Tidak ada QC dengan status "${statusOptions[statusFilter]?.label || statusFilter}".` : "Belum ada pemeriksaan kualitas."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">QC Number</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Receiving</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Produk / Batch</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500">Quantity</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500">Hasil</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Tanggal</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Catatan</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {filtered.map((record) => {
                  const statusInfo = statusOptions[record.status || ""] || { label: record.status || "—", tone: "neutral" as const };
                  const resultInfo = resultOptions[record.result || ""] || { label: record.result || "—", tone: "neutral" as const };
                  const items = record.receiving_records?.receiving_items || [];
                  const isPending = PENDING_STATUSES.includes(record.status || "");
                  return (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-medium text-ink">{record.qc_number || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{record.receiving_records?.receiving_number || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {items.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            {items.map((item, index) => (
                              <div key={`${record.id}-${index}`}>
                                <span className="text-ink">{item.products?.name || "—"}</span>
                                {item.batch_number ? (
                                  <span className="ml-2 font-mono text-xs text-slate-400">{item.batch_number}</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {items.length === 0
                          ? "—"
                          : items
                              .map((item) => Number(item.actual_quantity ?? item.quantity ?? 0).toLocaleString("id-ID"))
                              .join(" + ")}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={resultInfo.tone}>{resultInfo.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{record.inspected_at ? formatDate(record.inspected_at) : record.created_at ? formatDate(record.created_at) : "—"}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-slate-500">{record.notes || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {isPending && canDecide ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            <button
                              onClick={() => void openDecideModal(record, "ACCEPTED")}
                              disabled={busyId === record.id}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busyId === record.id ? "..." : "Terima"}
                            </button>
                            <button
                              onClick={() => void openDecideModal(record, "QUARANTINE")}
                              disabled={busyId === record.id}
                              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Quarantine
                            </button>
                            <button
                              onClick={() => void openDecideModal(record, "REJECTED")}
                              disabled={busyId === record.id}
                              className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Tolak
                            </button>
                          </div>
                        ) : isPending ? (
                          <span className="text-xs text-slate-400">Menunggu QC</span>
                        ) : (
                          <button
                            onClick={() => setSelectedRecord(record)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            Detail
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── QC Decision / Detail Modal ─────────────────────────────── */}
      <Modal
        isOpen={!!selectedRecord}
        onClose={() => { setSelectedRecord(null); setPhotoUrls([]); }}
        title={`QC ${selectedRecord?.qc_number || ""}`}
        description="Isi checklist kondisi barang dan lampirkan foto evidence."
        size="xl"
      >
        <form onSubmit={submitDecision} className="space-y-6">
          {/* ── Checklist Umum ─────────────────────────────────────── */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">Checklist Kondisi Barang</h3>
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-slate-50 p-4 sm:grid-cols-2">
              {/* Packaging */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Kondisi Kemasan</label>
                <select
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  value={checklist.packaging_condition || ""}
                  onChange={e => setChecklist(c => ({ ...c, packaging_condition: e.target.value }))}
                >
                  <option value="">— Pilih —</option>
                  <option value="Baik">Baik</option>
                  <option value="Rusak">Rusak</option>
                  <option value="Tidak Lengkap">Tidak Lengkap</option>
                </select>
              </div>

              {/* Appearance */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Penampilan / Warna</label>
                <select
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  value={checklist.appearance || ""}
                  onChange={e => setChecklist(c => ({ ...c, appearance: e.target.value }))}
                >
                  <option value="">— Pilih —</option>
                  <option value="Baik">Baik</option>
                  <option value="Kurang">Kurang</option>
                  <option value="Buruk">Buruk</option>
                </select>
              </div>

              {/* Temperature reading */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Suhu Pembacaan (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="cth: -18"
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  value={checklist.temperature_reading ?? ""}
                  onChange={e => setChecklist(c => ({ ...c, temperature_reading: e.target.value === "" ? null : parseFloat(e.target.value) }))}
                />
              </div>

              {/* Temperature note */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Catatan Suhu</label>
                <input
                  type="text"
                  placeholder="Kondisi freezer / transport..."
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  value={checklist.temperature_note || ""}
                  onChange={e => setChecklist(c => ({ ...c, temperature_note: e.target.value }))}
                />
              </div>

              {/* Expiry check */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Cek Kedaluwarsa</label>
                <select
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  value={checklist.expiry_check || ""}
                  onChange={e => setChecklist(c => ({ ...c, expiry_check: e.target.value }))}
                >
                  <option value="">— Pilih —</option>
                  <option value="Lulus">Lulus</option>
                  <option value="MendekatiExpiry">Mendekati Expired</option>
                  <option value="Kedaluwarsa">Kedaluwarsa</option>
                </select>
              </div>

              {/* Weight match */}
              <div className="flex items-center gap-3 rounded-lg border border-line bg-white p-3">
                <input
                  type="checkbox"
                  id="weight_match"
                  className="h-4 w-4 accent-emerald-600"
                  checked={!!checklist.weight_match}
                  onChange={e => setChecklist(c => ({ ...c, weight_match: e.target.checked }))}
                />
                <label htmlFor="weight_match" className="text-sm text-slate-700">
                  Berat aktual sesuai label / BO
                </label>
              </div>

              {/* Document complete */}
              <div className="flex items-center gap-3 rounded-lg border border-line bg-white p-3 sm:col-span-2">
                <input
                  type="checkbox"
                  id="doc_complete"
                  className="h-4 w-4 accent-emerald-600"
                  checked={!!checklist.document_complete}
                  onChange={e => setChecklist(c => ({ ...c, document_complete: e.target.checked }))}
                />
                <label htmlFor="doc_complete" className="text-sm text-slate-700">
                  Dokumen lengkap (COA / Sertifikat Halal / Dokumen impor)
                </label>
              </div>
            </div>
          </div>

          {/* ── Photo Evidence ─────────────────────────────────────── */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">Foto Evidence</h3>
            <div className="space-y-3">
              {photoUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photoUrls.map((url, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={url}
                        alt={`Evidence ${idx + 1}`}
                        className="h-24 w-full rounded-lg border border-line object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotoUrls(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow opacity-0 group-hover:opacity-100"
                        style={{ fontSize: "10px" }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white py-4 text-sm text-slate-500 transition-colors hover:border-primary hover:text-primary">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {uploading ? "Mengunggah..." : "Tambah Foto (JPEG/PNG/WebP, maks 10MB)"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          {/* ── Status + Notes ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Keputusan QC</label>
              <select
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium"
                value={formStatus}
                onChange={e => setFormStatus(e.target.value as "ACCEPTED" | "REJECTED" | "QUARANTINE")}
                required
              >
                <option value="ACCEPTED">✅ Diterima (Pass)</option>
                <option value="QUARANTINE">⚠️ Quarantine</option>
                <option value="REJECTED">❌ Ditolak (Fail)</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Catatan (opsional)</label>
              <textarea
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                rows={2}
                placeholder="Catatan inspeksi..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
              />
            </div>
          </div>

          {/* ── Actions ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => { setSelectedRecord(null); setPhotoUrls([]); }}
              className="rounded-lg border border-line px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busyId !== null}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyId ? "Menyimpan..." : "Simpan Keputusan QC"}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
