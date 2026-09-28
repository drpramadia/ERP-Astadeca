"use client";

import { useEffect, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documents/types";
import { formatDate, formatCurrency } from "@/lib/utils";

interface DocumentLine {
  id: string;
  line_number: number;
  description?: string;
  sku?: string;
  batch_number?: string;
  quantity?: number;
  unit_code?: string;
  unit_price?: number;
  discount_percentage?: number;
  subtotal?: number;
}

interface Document {
  id: string;
  document_type: string;
  document_number: string;
  document_date: string;
  status: string;
  title: string;
  subtitle?: string;
  reference_number?: string;
  reference_type?: string;
  verification_token: string;
  notes?: string;
  customer?: { name: string; address?: string; code?: string };
  supplier?: { name: string; address?: string; code?: string };
  lines: DocumentLine[];
}

export default function DocumentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);

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

      if (!error && data) {
        setDocument(data as unknown as Document);
      }
      setLoading(false);
    }
    fetchDocument();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-slate-500">Memuat dokumen...</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-slate-500">Dokumen tidak ditemukan</div>
      </div>
    );
  }

  const docTypeLabel = DOCUMENT_TYPE_LABELS[document.document_type as keyof typeof DOCUMENT_TYPE_LABELS] || document.document_type;

  const calculateTotals = () => {
    const subtotal = document.lines?.reduce((sum, line) => sum + (line.subtotal || 0), 0) || 0;
    const tax = subtotal * 0.11;
    const grandTotal = subtotal + tax;
    return { subtotal, tax, grandTotal };
  };

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-slate-100 py-8">
      {/* Print Controls */}
      <div className="fixed top-4 right-4 flex gap-2 z-50">
        <button
          onClick={() => window.print()}
          className="bg-ink text-white px-4 py-2 rounded-lg shadow-lg hover:bg-slate-700 transition-colors"
        >
          🖨️ Print
        </button>
        <button
          onClick={() => window.close()}
          className="bg-white text-ink px-4 py-2 rounded-lg shadow-lg hover:bg-slate-50 transition-colors"
        >
          ✕ Close
        </button>
      </div>

      {/* A4 Document */}
      <div className="mx-auto bg-white shadow-2xl" style={{ width: "210mm", minHeight: "297mm" }}>
        {/* Document Header */}
        <div className="p-12 border-b-2 border-black">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold tracking-[0.2em] text-slate-600 uppercase">
                ASTADECA BASWARA PERSADA
              </div>
              <div className="text-xs text-slate-500 mt-1">NAWASENA DAKARA ABADI</div>
              <div className="text-xs text-slate-500">Cold Storage & Supply Chain</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-600">{docTypeLabel}</div>
              <div className="text-sm font-bold mt-1">No: {document.document_number}</div>
              <div className="text-xs text-slate-500 mt-1">Tanggal: {formatDate(document.document_date)}</div>
            </div>
          </div>
        </div>

        {/* Document Title */}
        <div className="px-12 pt-8 pb-4">
          <h1 className="text-xl font-bold text-center uppercase">{document.title}</h1>
          {document.subtitle && (
            <p className="text-center text-sm text-slate-600 mt-1">{document.subtitle}</p>
          )}
        </div>

        {/* Reference Info */}
        <div className="px-12 pb-6">
          <div className="grid grid-cols-2 gap-6 text-sm">
            {document.customer && (
              <div>
                <div className="font-semibold text-slate-600 mb-1">Customer:</div>
                <div className="font-medium">{document.customer.name}</div>
                {document.customer.address && (
                  <div className="text-slate-500 text-xs">{document.customer.address}</div>
                )}
                {document.customer.code && (
                  <div className="text-slate-400 text-xs">Code: {document.customer.code}</div>
                )}
              </div>
            )}
            {document.supplier && (
              <div>
                <div className="font-semibold text-slate-600 mb-1">Supplier:</div>
                <div className="font-medium">{document.supplier.name}</div>
                {document.supplier.address && (
                  <div className="text-slate-500 text-xs">{document.supplier.address}</div>
                )}
                {document.supplier.code && (
                  <div className="text-slate-400 text-xs">Code: {document.supplier.code}</div>
                )}
              </div>
            )}
          </div>
          {document.reference_number && (
            <div className="mt-4 pt-4 border-t text-sm">
              <span className="font-semibold text-slate-600">Referensi {document.reference_type}:</span>{" "}
              <span className="font-mono">{document.reference_number}</span>
            </div>
          )}
        </div>

        {/* Document Lines Table */}
        {document.lines && document.lines.length > 0 && (
          <div className="px-12 pb-6">
            <table className="w-full text-xs border-collapse border border-black">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-black p-2 text-center w-8">No</th>
                  <th className="border border-black p-2 text-left">Deskripsi</th>
                  {document.lines[0]?.sku && (
                    <th className="border border-black p-2 text-center">SKU</th>
                  )}
                  {document.lines[0]?.batch_number && (
                    <th className="border border-black p-2 text-center">Batch</th>
                  )}
                  {document.lines[0]?.quantity !== undefined && (
                    <th className="border border-black p-2 text-center">Qty</th>
                  )}
                  {document.lines[0]?.unit_code && (
                    <th className="border border-black p-2 text-center">Unit</th>
                  )}
                  {document.lines[0]?.unit_price !== undefined && (
                    <>
                      <th className="border border-black p-2 text-right">Harga</th>
                      <th className="border border-black p-2 text-right">Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {document.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="border border-black p-2 text-center">{line.line_number}</td>
                    <td className="border border-black p-2">{line.description || "-"}</td>
                    {line.sku && (
                      <td className="border border-black p-2 text-center font-mono">{line.sku}</td>
                    )}
                    {line.batch_number && (
                      <td className="border border-black p-2 text-center font-mono">{line.batch_number}</td>
                    )}
                    {line.quantity !== undefined && (
                      <td className="border border-black p-2 text-right">
                        {line.quantity.toLocaleString("id-ID")}
                      </td>
                    )}
                    {line.unit_code && (
                      <td className="border border-black p-2 text-center">{line.unit_code}</td>
                    )}
                    {line.unit_price !== undefined && (
                      <>
                        <td className="border border-black p-2 text-right">
                          {formatCurrency(line.unit_price)}
                        </td>
                        <td className="border border-black p-2 text-right font-medium">
                          {line.subtotal ? formatCurrency(line.subtotal) : "-"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              {document.lines[0]?.unit_price !== undefined && (
                <tfoot>
                  <tr>
                    <td
                      colSpan={document.lines[0]?.batch_number ? 5 : 3}
                      className="border border-black p-2 text-right font-semibold"
                    >
                      Subtotal:
                    </td>
                    <td className="border border-black p-2 text-right">
                      {formatCurrency(totals.subtotal)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={document.lines[0]?.batch_number ? 5 : 3}
                      className="border border-black p-2 text-right"
                    >
                      PPN (11%):
                    </td>
                    <td className="border border-black p-2 text-right">
                      {formatCurrency(totals.tax)}
                    </td>
                  </tr>
                  <tr className="bg-slate-100">
                    <td
                      colSpan={document.lines[0]?.batch_number ? 5 : 3}
                      className="border border-black p-2 text-right font-bold"
                    >
                      TOTAL:
                    </td>
                    <td className="border border-black p-2 text-right font-bold">
                      {formatCurrency(totals.grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Notes */}
        {document.notes && (
          <div className="px-12 pb-6">
            <div className="text-sm">
              <span className="font-semibold text-slate-600">Catatan:</span>
              <p className="text-slate-600 whitespace-pre-wrap mt-1">{document.notes}</p>
            </div>
          </div>
        )}

        {/* Signatures */}
        <div className="px-12 pb-8">
          <div className="grid grid-cols-3 gap-8 mt-16">
            <div className="text-center">
              <div className="h-16 border-b border-black mb-1" />
              <div className="text-xs font-semibold">Dibuat Oleh</div>
              <div className="text-xs text-slate-500 mt-1">{formatDate(document.document_date)}</div>
            </div>
            <div className="text-center">
              <div className="h-16 border-b border-black mb-1" />
              <div className="text-xs font-semibold">Disetujui</div>
              <div className="text-xs text-slate-500 mt-1">&nbsp;</div>
            </div>
            <div className="text-center">
              <div className="h-16 border-b border-black mb-1" />
              <div className="text-xs font-semibold">Diterima</div>
              <div className="text-xs text-slate-500 mt-1">&nbsp;</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-8 left-12 right-12 border-t border-slate-300 pt-4">
          <div className="flex justify-between items-center text-xs text-slate-500">
            <div>
              Dokumen ini diterbitkan melalui sistem ASTADECA BASWARA PERSADA
            </div>
            <div>
              {document.document_number} | Halaman 1/1
            </div>
          </div>
          {document.verification_token && (
            <div className="text-center mt-4">
              <div className="inline-block border border-slate-300 rounded p-3 text-xs">
                <div className="font-bold text-slate-600">VERIFIKASI DOKUMEN</div>
                <div className="text-slate-500 mt-1">
                  Token: {document.verification_token.slice(0, 8).toUpperCase()}
                </div>
                <div className="text-slate-400 mt-1">
                  Scan QR atau kunjungi verify.astadeca.com
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          .fixed {
            display: none !important;
          }
          .mx-auto {
            box-shadow: none !important;
          }
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
