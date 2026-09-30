"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface DocumentLine {
  line_number: number;
  description: string;
  sku: string;
  quantity: number;
  unit_code: string;
  unit_price: number;
  subtotal: number;
}

interface Document {
  id: string;
  document_number: string;
  document_date: string;
  status: string;
  title: string;
  notes: string;
  reference_number: string;
  verification_token: string;
  supplier: { name: string; address: string; code: string; contact_person: string; phone: string };
  purchase_order?: {
    po_number: string;
    order_date: string;
    expected_date: string;
    payment_terms_days: number;
    delivery_terms: string;
    subtotal: number;
    discount_percentage: number;
    tax_percentage: number;
    tax_amount: number;
    total_amount: number;
    approved_by: string;
  };
}

interface Props { params: Promise<{ id: string }>; }

export default function PurchaseOrderPrintPage({ params }: Props) {
  const [document, setDocument] = useState<Document | null>(null);
  const [lines, setLines] = useState<DocumentLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);

  useEffect(() => { params.then(p => setResolvedParams(p)); }, [params]);

  useEffect(() => {
    if (!resolvedParams) return;
    
    async function fetchData() {
      const supabase = createClient();
      const { data: doc, error } = await supabase
        .from("documents")
        .select(`*, supplier:suppliers(*)`)
        .eq("id", resolvedParams!.id)
        .single();

      if (error || !doc) { setLoading(false); return; }
      setDocument(doc);

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

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><div className="text-slate-500">Memuat...</div></div>;
  if (!document) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><div className="text-slate-500">Dokumen tidak ditemukan</div></div>;

  const po = document.purchase_order;
  const subtotal = lines.reduce((sum, l) => sum + (l.subtotal || 0), 0);
  const discount = subtotal * ((po?.discount_percentage || 0) / 100);
  const afterDiscount = subtotal - discount;
  const tax = afterDiscount * ((po?.tax_percentage || 11) / 100);
  const grandTotal = afterDiscount + tax;

  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <div className="fixed top-4 right-4 flex gap-2 z-50">
        <button onClick={() => window.print()} className="bg-ink text-white px-4 py-2 rounded-lg shadow-lg">🖨️ Print</button>
        <Link href={`/documents/${document.id}} className="bg-white text-ink px-4 py-2 rounded-lg shadow-lg">← Kembali</Link>
      </div>

      <div className="mx-auto bg-white shadow-2xl" style={{ width: "210mm", minHeight: "297mm" }}>
        {/* Header */}
        <div className="p-12 border-b-2 border-black">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold tracking-[0.2em] text-slate-600 uppercase">ASTADECA BASWARA PERSADA</div>
              <div className="text-xs text-slate-500 mt-1">NAWASENA DAKARA ABADI</div>
              <div className="text-xs text-slate-500">Cold Storage & Supply Chain</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-600">PURCHASE ORDER</div>
              <div className="text-sm font-bold mt-1">{document.document_number}</div>
              <div className="text-xs text-slate-500 mt-1">Tanggal: {new Date(document.document_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
            </div>
          </div>
        </div>

        {/* Supplier Info */}
        <div className="px-12 pt-8">
          <div className="border border-black p-4">
            <div className="text-xs font-semibold text-slate-600 mb-2">VENDOR / SUPPLIER:</div>
            <div className="font-semibold">{document.supplier?.name || "-"}</div>
            <div className="text-sm text-slate-600">{document.supplier?.address || "-"}</div>
            <div className="text-xs text-slate-500 mt-2">PIC: {document.supplier?.contact_person || "-"} | {document.supplier?.phone || "-"}</div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
            <div><span className="text-slate-500">No PO:</span> <span className="font-mono font-semibold">{po?.po_number || "-"}</span></div>
            <div><span className="text-slate-500">Expected Delivery:</span> <span className="font-semibold">{po?.expected_date ? new Date(po.expected_date).toLocaleDateString("id-ID") : "-"}</span></div>
            <div><span className="text-slate-500">Payment Terms:</span> <span className="font-semibold">{po?.payment_terms_days || 0} Days</span></div>
          </div>
        </div>

        {/* Items Table */}
        <div className="px-12 pt-6">
          <table className="w-full text-xs border-collapse border border-black">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-black p-2 text-center w-8">No</th>
                <th className="border border-black p-2 text-left">Deskripsi</th>
                <th className="border border-black p-2 text-center">SKU</th>
                <th className="border border-black p-2 text-right">Qty</th>
                <th className="border border-black p-2 text-center">Unit</th>
                <th className="border border-black p-2 text-right">Harga</th>
                <th className="border border-black p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.line_number}>
                  <td className="border border-black p-2 text-center">{line.line_number}</td>
                  <td className="border border-black p-2">{line.description}</td>
                  <td className="border border-black p-2 text-center font-mono">{line.sku || "-"}</td>
                  <td className="border border-black p-2 text-right">{line.quantity?.toLocaleString("id-ID")}</td>
                  <td className="border border-black p-2 text-center">{line.unit_code || "KG"}</td>
                  <td className="border border-black p-2 text-right">Rp {line.unit_price?.toLocaleString("id-ID") || "0"}</td>
                  <td className="border border-black p-2 text-right font-medium">Rp {line.subtotal?.toLocaleString("id-ID") || "0"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={6} className="border border-black p-2 text-right">Subtotal:</td><td className="border border-black p-2 text-right">Rp {subtotal.toLocaleString("id-ID")}</td></tr>
              {discount > 0 && <tr><td colSpan={6} className="border border-black p-2 text-right">Discount ({po?.discount_percentage || 0}%):</td><td className="border border-black p-2 text-right">-Rp {discount.toLocaleString("id-ID")}</td></tr>}
              <tr><td colSpan={6} className="border border-black p-2 text-right">Tax ({po?.tax_percentage || 11}%):</td><td className="border border-black p-2 text-right">Rp {tax.toLocaleString("id-ID")}</td></tr>
              <tr className="bg-slate-100"><td colSpan={6} className="border border-black p-2 text-right font-bold">GRAND TOTAL:</td><td className="border border-black p-2 text-right font-bold">Rp {grandTotal.toLocaleString("id-ID")}</td></tr>
            </tfoot>
          </table>
        </div>

        {/* Notes & Terms */}
        <div className="px-12 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-black p-4">
              <div className="text-xs font-semibold text-slate-600 mb-1">NOTES:</div>
              <div className="text-sm whitespace-pre-wrap">{document.notes || "-"}</div>
            </div>
            <div className="border border-black p-4">
              <div className="text-xs font-semibold text-slate-600 mb-1">DELIVERY TERMS:</div>
              <div className="text-sm">{po?.delivery_terms || "-"}</div>
            </div>
          </div>
        </div>

        {/* Signature Block */}
        <div className="px-12 pt-8 pb-12">
          <div className="grid grid-cols-3 gap-8 mt-16">
            <div className="text-center"><div className="h-16 border-b border-black mb-1" /><div className="text-xs font-semibold">Dibuat Oleh</div><div className="text-xs text-slate-500">Purchasing</div></div>
            <div className="text-center"><div className="h-16 border-b border-black mb-1" /><div className="text-xs font-semibold">Disetujui</div><div className="text-xs text-slate-500">Manager</div></div>
            <div className="text-center"><div className="h-16 border-b border-black mb-1" /><div className="text-xs font-semibold">Diketahui</div><div className="text-xs text-slate-500">Director</div></div>
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
      <style jsx global>{`@media print { body { background: white; } .fixed { display: none !important; } .mx-auto { box-shadow: none !important; } @page { size: A4; margin: 0; } }`}</style>
    </div>
  );
}
