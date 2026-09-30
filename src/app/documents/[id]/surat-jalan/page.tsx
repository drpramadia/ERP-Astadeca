"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface DocumentLine {
  line_number: number;
  description: string;
  sku: string;
  batch_number: string;
  quantity: number;
  unit_code: string;
}

interface Document {
  id: string;
  document_number: string;
  document_date: string;
  status: string;
  title: string;
  notes: string;
  reference_number: string;
  reference_type: string;
  verification_token: string;
  customer: { name: string; address: string; code: string };
  supplier: { name: string; address: string; code: string };
  delivery_order?: {
    do_number: string;
    vehicle_number: string;
    driver_name: string;
    recipient_name: string;
    recipient_address: string;
  };
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function SuratJalanPrintPage({ params }: Props) {
  const [document, setDocument] = useState<Document | null>(null);
  const [lines, setLines] = useState<DocumentLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);

  useEffect(() => {
    params.then(p => setResolvedParams(p));
  }, [params]);

  useEffect(() => {
    if (!resolvedParams) return;
    
    async function fetchData() {
      const supabase = createClient();
      
      // Fetch document
      const { data: doc, error } = await supabase
        .from("documents")
        .select(`
          *,
          customer:customers(*),
          supplier:suppliers(*)
        `)
        .eq("id", resolvedParams!.id)
        .single();

      if (error || !doc) {
        setLoading(false);
        return;
      }

      setDocument(doc);

      // Fetch document lines
      const { data: docLines } = await supabase
        .from("document_lines")
        .select("*")
        .eq("document_id", resolvedParams!.id)
        .order("line_number");

      setLines((docLines || []) as DocumentLine[]);
      setLoading(false);
    }
    
    fetchData();
  }, [resolvedParams]);

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

  const totalQuantity = lines.reduce((sum, line) => sum + (line.quantity || 0), 0);

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
        <Link
          href={`/documents/${document.id}
          className="bg-white text-ink px-4 py-2 rounded-lg shadow-lg hover:bg-slate-50 transition-colors"
        >
          ← Kembali
        </Link>
      </div>

      {/* A4 Document */}
      <div className="mx-auto bg-white shadow-2xl" style={{ width: "210mm", minHeight: "297mm" }}>
        {/* Header */}
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
              <div className="text-xs font-semibold text-slate-600">SURAT JALAN</div>
              <div className="text-sm font-bold mt-1">{document.document_number}</div>
              <div className="text-xs text-slate-500 mt-1">
                Tanggal: {new Date(document.document_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="px-12 pt-8">
          <div className="grid grid-cols-2 gap-6">
            <div className="border border-black p-4">
              <div className="text-xs font-semibold text-slate-600 mb-2">PENERIMA (TO):</div>
              <div className="font-semibold">{document.customer?.name || "-"}</div>
              <div className="text-sm text-slate-600">{document.customer?.address || "-"}</div>
              <div className="text-xs text-slate-500 mt-2">Code: {document.customer?.code || "-"}</div>
            </div>
            <div className="border border-black p-4">
              <div className="text-xs font-semibold text-slate-600 mb-2">SALES ORDER:</div>
              <div className="font-mono font-semibold">{document.reference_number || "-"}</div>
              <div className="text-xs text-slate-500 mt-2">Referensi: {document.reference_type || "-"}</div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="px-12 pt-6">
          <table className="w-full text-xs border-collapse border border-black">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-black p-2 text-center w-10">No</th>
                <th className="border border-black p-2 text-left">Nama Barang</th>
                <th className="border border-black p-2 text-center">SKU</th>
                <th className="border border-black p-2 text-center">Batch</th>
                <th className="border border-black p-2 text-right">Jumlah</th>
                <th className="border border-black p-2 text-center">Satuan</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.line_number}>
                  <td className="border border-black p-2 text-center">{line.line_number}</td>
                  <td className="border border-black p-2">{line.description}</td>
                  <td className="border border-black p-2 text-center font-mono">{line.sku || "-"}</td>
                  <td className="border border-black p-2 text-center font-mono">{line.batch_number || "-"}</td>
                  <td className="border border-black p-2 text-right font-medium">
                    {line.quantity?.toLocaleString("id-ID") || "0"}
                  </td>
                  <td className="border border-black p-2 text-center">{line.unit_code || "KG"}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="border border-black p-4 text-center text-slate-500">
                    Tidak ada item
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100">
                <td colSpan={4} className="border border-black p-2 text-right font-bold">TOTAL:</td>
                <td className="border border-black p-2 text-right font-bold">{totalQuantity.toLocaleString("id-ID")}</td>
                <td className="border border-black p-2 text-center font-bold">KG</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {document.notes && (
          <div className="px-12 pt-6">
            <div className="border border-black p-4">
              <div className="text-xs font-semibold text-slate-600 mb-1">CATATAN:</div>
              <div className="text-sm whitespace-pre-wrap">{document.notes}</div>
            </div>
          </div>
        )}

        {/* Signature Block */}
        <div className="px-12 pt-8 pb-12">
          <div className="grid grid-cols-3 gap-8 mt-16">
            <div className="text-center">
              <div className="h-16 border-b border-black mb-1" />
              <div className="text-xs font-semibold">Diserahkan Oleh</div>
              <div className="text-xs text-slate-500">Pengirim</div>
            </div>
            <div className="text-center">
              <div className="h-16 border-b border-black mb-1" />
              <div className="text-xs font-semibold">Dicek Oleh</div>
              <div className="text-xs text-slate-500">Checker Gudang</div>
            </div>
            <div className="text-center">
              <div className="h-16 border-b border-black mb-1" />
              <div className="text-xs font-semibold">Diterima Oleh</div>
              <div className="text-xs text-slate-500">Penerima</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-8 left-12 right-12 border-t border-slate-300 pt-4">
          <div className="flex justify-between items-center text-xs text-slate-500">
            <div>Dokumen ini diterbitkan melalui sistem ASTADECA BASWARA PERSADA</div>
            <div>{document.document_number}</div>
          </div>
          {document.verification_token && (
            <div className="text-center mt-4">
              <div className="inline-block border border-slate-300 rounded p-3 text-xs">
                <div className="font-bold text-slate-600">VERIFIKASI DOKUMEN</div>
                <div className="text-slate-500 mt-1">Token: {document.verification_token.slice(0, 8).toUpperCase()}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body { background: white; }
          .fixed { display: none !important; }
          .mx-auto { box-shadow: none !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );
}
