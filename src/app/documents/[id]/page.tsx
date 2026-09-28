"use client";

import { useEffect, useState, use } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documents/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface DocumentLine {
  id: string;
  line_number: number;
  product_id?: string;
  description?: string;
  sku?: string;
  batch_number?: string;
  quantity?: number;
  unit_code?: string;
  unit_price?: number;
  discount_percentage?: number;
  tax_percentage?: number;
  subtotal?: number;
  notes?: string;
}

interface Document {
  id: string;
  organization_id: string;
  document_type: string;
  document_number: string;
  document_date: string;
  status: string;
  title: string;
  subtitle?: string;
  source_type?: string;
  source_id?: string;
  customer_id?: string;
  supplier_id?: string;
  reference_number?: string;
  reference_type?: string;
  verification_token: string;
  metadata: Record<string, unknown>;
  notes?: string;
  issued_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  customer?: { id: string; name: string; code: string; address?: string };
  supplier?: { id: string; name: string; code: string; address?: string };
  lines: DocumentLine[];
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchDocument() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          customer:customers(*),
          supplier:suppliers(*),
          lines:document_lines(*)
        `)
        .eq("id", id)
        .single();

      if (error || !data) {
        router.push("/documents");
        return;
      }

      setDocument(data as unknown as Document);
      setLoading(false);
    }
    fetchDocument();
  }, [id, router]);

  const handleStatusChange = async (newStatus: string) => {
    if (!document) return;
    setUpdating(true);

    const supabase = createClient();
    const updateData: Record<string, unknown> = { status: newStatus };
    
    if (newStatus === "ISSUED") {
      const { data: claimsData } = await supabase.auth.getClaims();
      const claims = claimsData?.claims;
      if (claims) {
        updateData.issued_at = new Date().toISOString();
        updateData.issued_by = claims.sub;
      }
    }

    const { error } = await supabase
      .from("documents")
      .update(updateData)
      .eq("id", document.id);

    if (!error) {
      setDocument({ ...document, ...updateData } as Document);
    }
    setUpdating(false);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-500">Memuat dokumen...</div>
        </div>
      </AppShell>
    );
  }

  if (!document) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-500">Dokumen tidak ditemukan</div>
        </div>
      </AppShell>
    );
  }

  const getStatusBadge = (status: string) => {
    const tones: Record<string, string> = {
      DRAFT: "neutral",
      PENDING: "warning",
      APPROVED: "info",
      ISSUED: "success",
      CANCELLED: "danger",
      VOID: "danger",
    };
    return <StatusBadge tone={tones[status] as "neutral" | "warning" | "info" | "success" | "danger"}>{status}</StatusBadge>;
  };

  return (
    <AppShell>
      <PageHeader
        title={document.title}
        description={`Dokumen ${DOCUMENT_TYPE_LABELS[document.document_type as keyof typeof DOCUMENT_TYPE_LABELS] || document.document_type}`}
        actions={
          <div className="flex gap-2">
            <Link href={`/documents/${document.id}/print`}>
              <Button variant="outline">🖨️ Print</Button>
            </Link>
            <Link href={`/documents/${document.id}/pdf`}>
              <Button variant="outline">📄 PDF</Button>
            </Link>
            {document.status === "DRAFT" && (
              <Button onClick={() => handleStatusChange("ISSUED")} disabled={updating}>
                {updating ? "Menyimpan..." : "Terbitkan"}
              </Button>
            )}
          </div>
        }
      />

      {/* Document Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Main Info */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-line p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {DOCUMENT_TYPE_LABELS[document.document_type as keyof typeof DOCUMENT_TYPE_LABELS] || document.document_type}
              </div>
              <h1 className="text-2xl font-bold mt-2">{document.document_number}</h1>
            </div>
            {getStatusBadge(document.status)}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500">Tanggal</div>
              <div className="font-medium">{formatDate(document.document_date)}</div>
            </div>
            {document.reference_number && (
              <div>
                <div className="text-slate-500">Referensi</div>
                <div className="font-medium font-mono">{document.reference_number}</div>
              </div>
            )}
            {document.customer && (
              <div>
                <div className="text-slate-500">Customer</div>
                <div className="font-medium">{document.customer.name}</div>
                <div className="text-xs text-slate-500">{document.customer.code}</div>
              </div>
            )}
            {document.supplier && (
              <div>
                <div className="text-slate-500">Supplier</div>
                <div className="font-medium">{document.supplier.name}</div>
                <div className="text-xs text-slate-500">{document.supplier.code}</div>
              </div>
            )}
          </div>

          {document.notes && (
            <div className="mt-6 pt-6 border-t">
              <div className="text-slate-500 text-sm mb-2">Catatan</div>
              <div className="text-sm whitespace-pre-wrap">{document.notes}</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Verification */}
          <div className="bg-white rounded-2xl border border-line p-6">
            <h3 className="font-semibold text-sm mb-4">Verifikasi Dokumen</h3>
            <div className="text-xs text-slate-500 mb-2">Token Verifikasi</div>
            <div className="font-mono text-sm bg-slate-50 p-2 rounded">
              {document.verification_token?.slice(0, 8).toUpperCase()}
            </div>
            <div className="mt-4 text-xs text-slate-500">
              {document.status === "ISSUED" ? (
                <span className="text-success">✓ Dokumen sudah diterbitkan</span>
              ) : (
                <span className="text-warning">⏳ Belum diterbitkan</span>
              )}
            </div>
          </div>

          {/* Actions */}
          {document.status === "DRAFT" && (
            <div className="bg-white rounded-2xl border border-line p-6">
              <h3 className="font-semibold text-sm mb-4">Aksi</h3>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => handleStatusChange("ISSUED")}
                  disabled={updating}
                >
                  Terbitkan Dokumen
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-danger"
                  onClick={() => handleStatusChange("CANCELLED")}
                  disabled={updating}
                >
                  Batalkan
                </Button>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white rounded-2xl border border-line p-6">
            <h3 className="font-semibold text-sm mb-4">Info Dokumen</h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Dibuat</span>
                <span>{formatDate(document.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Diperbarui</span>
                <span>{formatDate(document.updated_at)}</span>
              </div>
              {document.issued_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Diterbitkan</span>
                  <span>{formatDate(document.issued_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Document Lines */}
      {document.lines && document.lines.length > 0 && (
        <div className="bg-white rounded-2xl border border-line p-6">
          <h3 className="font-semibold text-sm mb-4">Item Dokumen</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left p-2 font-semibold text-slate-600 w-8">No</th>
                <th className="text-left p-2 font-semibold text-slate-600">Deskripsi</th>
                <th className="text-left p-2 font-semibold text-slate-600">SKU</th>
                <th className="text-left p-2 font-semibold text-slate-600">Batch</th>
                <th className="text-right p-2 font-semibold text-slate-600">Qty</th>
                <th className="text-right p-2 font-semibold text-slate-600">Harga</th>
                <th className="text-right p-2 font-semibold text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {document.lines.map((line) => (
                <tr key={line.id} className="border-b border-line">
                  <td className="p-2 text-center">{line.line_number}</td>
                  <td className="p-2">{line.description || "-"}</td>
                  <td className="p-2 font-mono text-xs">{line.sku || "-"}</td>
                  <td className="p-2 font-mono text-xs">{line.batch_number || "-"}</td>
                  <td className="p-2 text-right">
                    {line.quantity ? `${line.quantity.toLocaleString("id-ID")} ${line.unit_code || ""}` : "-"}
                  </td>
                  <td className="p-2 text-right">
                    {line.unit_price ? formatCurrency(line.unit_price) : "-"}
                  </td>
                  <td className="p-2 text-right font-medium">
                    {line.subtotal ? formatCurrency(line.subtotal) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Print Preview Link */}
      <div className="mt-6 text-center">
        <Link href={`/documents/${document.id}/print`}>
          <Button variant="outline" className="px-8">
            🖨️ Lihat Preview Cetak
          </Button>
        </Link>
      </div>
    </AppShell>
  );
}
