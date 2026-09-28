"use client";

import React from "react";
import { DocumentType, DOCUMENT_TYPE_LABELS } from "@/lib/documents/types";

interface DocumentTemplateProps {
  type: DocumentType;
  number: string;
  date: string;
  title: string;
  subtitle?: string;
  customer?: { name: string; address?: string; code?: string };
  supplier?: { name: string; address?: string; code?: string };
  reference?: { number: string; type?: string };
  lines: {
    no: number;
    description: string;
    sku?: string;
    batch?: string;
    quantity?: number;
    unit?: string;
    price?: number;
    discount?: number;
    total?: number;
  }[];
  totals?: {
    subtotal?: number;
    discount?: number;
    tax?: number;
    grandTotal?: number;
  };
  notes?: string;
  signatures?: {
    submittedBy?: { name: string; date?: string };
    approvedBy?: { name: string; date?: string };
    receivedBy?: { name: string; date?: string; time?: string };
  };
  verificationToken?: string;
  qrUrl?: string;
}

export function DocumentTemplate({
  type,
  number,
  date,
  title,
  subtitle,
  customer,
  supplier,
  reference,
  lines,
  totals,
  notes,
  signatures,
  verificationToken,
}: DocumentTemplateProps) {
  const docTypeLabel = DOCUMENT_TYPE_LABELS[type] || type;

  return (
    <div className="bg-white p-8 mx-auto shadow-lg" style={{ width: "210mm", minHeight: "297mm", fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div className="border-b-2 border-black pb-4 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-bold tracking-widest text-slate-600 uppercase">ASTADECA BASWARA PERSADA</div>
            <div className="text-xs text-slate-500">NAWASENA DAKARA ABADI</div>
            <div className="text-xs text-slate-500">Cold Storage & Supply Chain</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold">{docTypeLabel}</div>
            <div className="text-xs text-slate-600 mt-1">No: {number}</div>
            <div className="text-xs text-slate-600">Tanggal: {date}</div>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold uppercase">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
      </div>

      {/* Reference Info */}
      {(customer || supplier || reference) && (
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          {customer && (
            <div>
              <span className="font-semibold">Customer:</span>
              <div>{customer.name}</div>
              {customer.address && <div className="text-slate-600">{customer.address}</div>}
              {customer.code && <div className="text-slate-500">Code: {customer.code}</div>}
            </div>
          )}
          {supplier && (
            <div>
              <span className="font-semibold">Supplier:</span>
              <div>{supplier.name}</div>
              {supplier.address && <div className="text-slate-600">{supplier.address}</div>}
              {supplier.code && <div className="text-slate-500">Code: {supplier.code}</div>}
            </div>
          )}
          {reference && (
            <div className="col-span-2 border-t pt-2 mt-2">
              <span className="font-semibold">Referensi {reference.type}:</span> {reference.number}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {lines.length > 0 && (
        <table className="w-full text-xs border-collapse border border-black mb-6">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black p-2 text-center w-8">No</th>
              {lines[0]?.sku && <th className="border border-black p-2 text-left">SKU</th>}
              <th className="border border-black p-2 text-left">Deskripsi</th>
              {lines[0]?.batch && <th className="border border-black p-2 text-center">Batch</th>}
              {lines[0]?.quantity !== undefined && <th className="border border-black p-2 text-center">Qty</th>}
              {lines[0]?.unit && <th className="border border-black p-2 text-center">Unit</th>}
              {lines[0]?.price !== undefined && <th className="border border-black p-2 text-right">Harga</th>}
              {lines[0]?.total !== undefined && <th className="border border-black p-2 text-right">Total</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="border border-black p-2 text-center">{line.no}</td>
                {line.sku && <td className="border border-black p-2">{line.sku}</td>}
                <td className="border border-black p-2">{line.description}</td>
                {line.batch && <td className="border border-black p-2 text-center">{line.batch}</td>}
                {line.quantity !== undefined && <td className="border border-black p-2 text-right">{line.quantity?.toLocaleString("id-ID")}</td>}
                {line.unit && <td className="border border-black p-2 text-center">{line.unit}</td>}
                {line.price !== undefined && <td className="border border-black p-2 text-right">{line.price?.toLocaleString("id-ID", { style: "currency", currency: "IDR" })}</td>}
                {line.total !== undefined && <td className="border border-black p-2 text-right">{line.total?.toLocaleString("id-ID", { style: "currency", currency: "IDR" })}</td>}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr>
                <td colSpan={lines[0]?.price !== undefined ? (lines[0]?.batch ? 5 : 3) : 2} className="border border-black p-2 text-right font-semibold">Subtotal:</td>
                {totals.subtotal !== undefined && <td className="border border-black p-2 text-right">{totals.subtotal.toLocaleString("id-ID", { style: "currency", currency: "IDR" })}</td>}
              </tr>
              {totals.discount !== undefined && totals.discount > 0 && (
                <tr>
                  <td colSpan={lines[0]?.price !== undefined ? (lines[0]?.batch ? 5 : 3) : 2} className="border border-black p-2 text-right">Discount:</td>
                  <td className="border border-black p-2 text-right">-{totals.discount.toLocaleString("id-ID", { style: "currency", currency: "IDR" })}</td>
                </tr>
              )}
              {totals.tax !== undefined && totals.tax > 0 && (
                <tr>
                  <td colSpan={lines[0]?.price !== undefined ? (lines[0]?.batch ? 5 : 3) : 2} className="border border-black p-2 text-right">Pajak (11%):</td>
                  <td className="border border-black p-2 text-right">{totals.tax.toLocaleString("id-ID", { style: "currency", currency: "IDR" })}</td>
                </tr>
              )}
              {totals.grandTotal !== undefined && (
                <tr className="bg-slate-100">
                  <td colSpan={lines[0]?.price !== undefined ? (lines[0]?.batch ? 5 : 3) : 2} className="border border-black p-2 text-right font-bold">TOTAL:</td>
                  <td className="border border-black p-2 text-right font-bold">{totals.grandTotal.toLocaleString("id-ID", { style: "currency", currency: "IDR" })}</td>
                </tr>
              )}
            </tfoot>
          )}
        </table>
      )}

      {/* Notes */}
      {notes && (
        <div className="mb-6 text-xs">
          <span className="font-semibold">Catatan:</span>
          <p className="text-slate-600 whitespace-pre-wrap">{notes}</p>
        </div>
      )}

      {/* Signatures */}
      {signatures && (
        <div className="grid grid-cols-3 gap-8 mt-12 text-xs">
          {signatures.submittedBy && (
            <div className="text-center">
              <div className="h-16 border-b border-black mb-1" />
              <div className="font-semibold">{signatures.submittedBy.name}</div>
              <div className="text-slate-500">Dikirim/Dibuat</div>
              {signatures.submittedBy.date && <div className="text-slate-400">{signatures.submittedBy.date}</div>}
            </div>
          )}
          {signatures.approvedBy && (
            <div className="text-center">
              <div className="h-16 border-b border-black mb-1" />
              <div className="font-semibold">{signatures.approvedBy.name}</div>
              <div className="text-slate-500">Disetujui</div>
              {signatures.approvedBy.date && <div className="text-slate-400">{signatures.approvedBy.date}</div>}
            </div>
          )}
          {signatures.receivedBy && (
            <div className="text-center">
              <div className="h-16 border-b border-black mb-1" />
              <div className="font-semibold">{signatures.receivedBy.name}</div>
              <div className="text-slate-500">Diterima</div>
              {signatures.receivedBy.date && <div className="text-slate-400">{signatures.receivedBy.date}</div>}
              {signatures.receivedBy.time && <div className="text-slate-400">{signatures.receivedBy.time}</div>}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-8 left-8 right-8 border-t border-slate-300 pt-4 mt-auto">
        <div className="flex justify-between items-center text-xs text-slate-500">
          <div>
            Dokumen ini diterbitkan melalui sistem ASTADECA BASWARA PERSADA
          </div>
          <div>
            {number} | Halaman 1/1
          </div>
        </div>
        {verificationToken && (
          <div className="text-center mt-2">
            <div className="inline-block border border-slate-300 rounded p-2 text-xs">
              <div className="font-semibold">VERIFIKASI DOKUMEN</div>
              <div className="text-slate-500 mt-1">Token: {verificationToken.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SuratJalanTemplate({ data }: { data: SuratJalanData }) {
  return (
    <DocumentTemplate
      type="SURAT_JALAN"
      number={data.number}
      date={data.date}
      title="SURAT JALAN"
      subtitle="Bukti Pengiriman Barang"
      customer={data.customer}
      reference={{ number: data.salesOrder, type: "Sales Order" }}
      lines={data.items.map((item, i) => ({
        no: i + 1,
        description: item.product,
        sku: item.sku,
        batch: item.batch,
        quantity: item.quantity,
        unit: item.unit,
      }))}
      notes={data.notes}
      signatures={{
        submittedBy: { name: data.shippedBy, date: data.date },
        receivedBy: { name: data.receivedBy, date: data.date, time: data.receivedTime },
      }}
      verificationToken={data.verificationToken}
    />
  );
}

export function PurchaseOrderTemplate({ data }: { data: PurchaseOrderData }) {
  return (
    <DocumentTemplate
      type="PURCHASE_ORDER"
      number={data.number}
      date={data.date}
      title="PURCHASE ORDER"
      subtitle={`PO untuk ${data.supplier?.name}`}
      supplier={data.supplier}
      reference={data.quotation ? { number: data.quotation, type: "Quotation" } : undefined}
      lines={data.items.map((item, i) => ({
        no: i + 1,
        description: item.product,
        sku: item.sku,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        total: item.total,
      }))}
      totals={{
        subtotal: data.subtotal,
        discount: data.discount,
        tax: data.tax,
        grandTotal: data.grandTotal,
      }}
      notes={`Payment Terms: ${data.paymentTerms}\nDelivery Terms: ${data.deliveryTerms}\n\n${data.notes || ""}`}
      signatures={{
        submittedBy: { name: data.createdBy },
        approvedBy: { name: data.approvedBy },
      }}
      verificationToken={data.verificationToken}
    />
  );
}

export function GoodsReceiptTemplate({ data }: { data: GoodsReceiptData }) {
  return (
    <DocumentTemplate
      type="GOODS_RECEIPT"
      number={data.number}
      date={data.date}
      title="BUKTI PENERIMAAN BARANG"
      subtitle={`GR untuk PO ${data.poNumber}`}
      supplier={data.supplier}
      reference={{ number: data.poNumber, type: "Purchase Order" }}
      lines={data.items.map((item, i) => ({
        no: i + 1,
        description: item.product,
        sku: item.sku,
        batch: item.batch,
        quantity: item.ordered,
        unit: item.unit,
      }))}
      notes={`Ordered Total: ${data.orderedTotal}\nReceived Total: ${data.receivedTotal}\nDifference: ${data.difference}\n\nCold Storage: ${data.coldStorage}\nLocation: ${data.location}\nQC Status: ${data.qcStatus}\n\n${data.notes || ""}`}
      signatures={{
        submittedBy: { name: data.receivedBy },
        approvedBy: { name: data.checkedBy },
      }}
      verificationToken={data.verificationToken}
    />
  );
}

interface SuratJalanData {
  number: string;
  date: string;
  customer: { name: string; address?: string; code?: string };
  salesOrder: string;
  items: { no: number; product: string; sku: string; batch: string; quantity: number; unit: string }[];
  notes?: string;
  shippedBy: string;
  receivedBy: string;
  receivedTime?: string;
  verificationToken?: string;
}

interface PurchaseOrderData {
  number: string;
  date: string;
  supplier: { name: string; address?: string; code?: string };
  quotation?: string;
  items: { no: number; product: string; sku: string; quantity: number; unit: string; price: number; total: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paymentTerms: string;
  deliveryTerms: string;
  notes?: string;
  createdBy: string;
  approvedBy: string;
  verificationToken?: string;
}

interface GoodsReceiptData {
  number: string;
  date: string;
  supplier: { name: string; address?: string; code?: string };
  poNumber: string;
  items: { no: number; product: string; sku: string; batch: string; ordered: number; received: number; unit: string }[];
  orderedTotal: number;
  receivedTotal: number;
  difference: number;
  coldStorage: string;
  location: string;
  qcStatus: string;
  notes?: string;
  receivedBy: string;
  checkedBy: string;
  verificationToken?: string;
}
