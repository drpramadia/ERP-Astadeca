"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { StockBadge } from "@/components/ui/stock-badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";

interface SalesOrder {
  id: string;
  so_number: string;
  customer_id: string;
  status: string;
  order_date: string;
  due_date?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  so_customer_fk?: { name: string; code: string };
}

interface QuotationItemRow {
  product_id: string;
  quantity: string;
  unit_id: string;
  unit_price: string;
  notes: string;
}

interface SOItemRow {
  product_id: string;
  quantity: string;
  unit_id: string;
  unit_price: string;
  notes: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface Customer {
  id: string;
  name: string;
  code: string;
}

interface Unit {
  id: string;
  name: string;
  code: string;
}

interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string;
  status: string;
  quotation_date: string;
  valid_until?: string;
  total_amount: number;
  notes?: string;
  qt_customer_fk?: { name: string; code: string };
}

export default function SalesPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "quotations">("orders");
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stockLevels, setStockLevels] = useState<Record<string, { available: number; minimum: number }>>({});
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [orgId, setOrgId] = useState<string>("");

  const [showCreateQuotation, setShowCreateQuotation] = useState(false);
  const [showCreateSO, setShowCreateSO] = useState(false);

  const [quotationForm, setQuotationForm] = useState({
    customer_id: "",
    quotation_date: new Date().toISOString().split("T")[0],
    valid_until: "",
    notes: "",
  });
  const [quotationItems, setQuotationItems] = useState<QuotationItemRow[]>([
    { product_id: "", quantity: "", unit_id: "", unit_price: "", notes: "" },
  ]);
  const [isSavingQuotation, setIsSavingQuotation] = useState(false);
  const [quotationError, setQuotationError] = useState("");

  const [soForm, setSoForm] = useState({
    customer_id: "",
    quotation_id: "",
    order_date: new Date().toISOString().split("T")[0],
    due_date: "",
    notes: "",
  });
  const [soItems, setSoItems] = useState<SOItemRow[]>([
    { product_id: "", quantity: "", unit_id: "", unit_price: "", notes: "" },
  ]);
  const [isSavingSO, setIsSavingSO] = useState(false);
  const [soError, setSoError] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getSession();
      const claims = sessionData?.session?.user;
      if (!claims) return;

      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", claims.sub)
        .eq("is_active", true)
        .maybeSingle();

      if (!membership) return;
      const orgId = membership.organization_id;
      setOrgId(orgId);

      // Order matters: the destructuring names mirror this array positionally.
      const [ordersRes, quotationsRes, productsRes, customersRes, unitsRes, stockRes] = await Promise.all([
        supabase.from("sales_orders").select("*, so_customer_fk(name, code)").eq("organization_id", orgId).order("order_date", { ascending: false }).limit(50),
        supabase.from("quotations").select("*, qt_customer_fk(name, code)").eq("organization_id", orgId).order("quotation_date", { ascending: false }).limit(50),
        supabase.from("products").select("id, name, sku").eq("organization_id", orgId).order("name"),
        supabase.from("customers").select("id, name, code").eq("active", true).order("name"),
        supabase.from("units").select("id, code, name").eq("active", true).order("name"),
        supabase.from("inventory_levels").select("product_id, available_quantity, minimum_stock").eq("organization_id", orgId),
      ]) as unknown as [{data: any},{data: any},{data: any},{data: any},{data: any},{data: any}];

      setOrders(ordersRes?.data || []);
      setQuotations(quotationsRes?.data || []);
      setProducts(productsRes?.data || []);
      setCustomers(customersRes?.data || []);
      setUnits(unitsRes?.data || []);
      setStockLevels(((stockRes as any)?.data || []).reduce((acc: Record<string, {available:number;minimum:number}>, s: any) => {
        if (s?.product_id) acc[s.product_id] = { available: Number(s.available_quantity) || 0, minimum: Number(s.minimum_stock) || 10 };
        return acc;
      }, {}));
      setIsLoading(false);
    }
    init();
  }, []);

  async function handleCreateQuotation(event: React.FormEvent) {
    event.preventDefault();
    setQuotationError("");
    if (!quotationForm.customer_id) { setQuotationError("Pilih customer."); return; }
    if (!quotationItems.some(i => i.product_id && i.quantity)) {
      setQuotationError("Tambahkan minimal satu item."); return;
    }

    setIsSavingQuotation(true);
    try {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getSession();
      const claims = sessionData?.session?.user;
      if (!claims) throw new Error("Not authenticated");

      const validItems = quotationItems.filter(i => i.product_id && i.quantity && i.unit_id && i.unit_price);
      const subtotal = validItems.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);

      const { data: qtNumber } = await supabase.rpc("get_next_number", { p_org_id: orgId, p_doc_type: "QT" });

      const insertData: Record<string, unknown> = {
        organization_id: orgId,
        quotation_number: (qtNumber as string) || "QT-UNKNOWN",
        customer_id: quotationForm.customer_id,
        status: "DRAFT",
        quotation_date: quotationForm.quotation_date,
        valid_until: quotationForm.valid_until || null,
        subtotal,
        tax_percentage: 0,
        tax_amount: 0,
        discount_percentage: 0,
        discount_amount: 0,
        total_amount: subtotal,
        validity_days: 14,
        notes: quotationForm.notes || null,
        created_by: claims.sub,
      };

      const { data: qtData, error: qtErr } = await supabase.from("quotations").insert(insertData).select("id").single();
      if (qtErr || !qtData) throw qtErr || new Error("Gagal membuat quotation.");

      const itemInserts = validItems.map(i => ({
        quotation_id: qtData.id,
        product_id: i.product_id,
        quantity: parseFloat(i.quantity),
        unit_id: i.unit_id,
        unit_price: parseFloat(i.unit_price),
      }));

      const { error: itemsErr } = await supabase.from("quotation_items").insert(itemInserts);
      if (itemsErr) throw itemsErr;

      const { data: updated } = await supabase
        .from("quotations")
        .select("*, qt_customer_fk(name, code)")
        .eq("id", qtData.id)
        .single();
      if (updated) setQuotations(prev => [updated, ...prev]);

      setShowCreateQuotation(false);
      setQuotationForm({ customer_id: "", quotation_date: new Date().toISOString().split("T")[0], valid_until: "", notes: "" });
      setQuotationItems([{ product_id: "", quantity: "", unit_id: "", unit_price: "", notes: "" }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setQuotationError(msg);
    } finally {
      setIsSavingQuotation(false);
    }
  }

  async function handleCreateSO(event: React.FormEvent) {
    event.preventDefault();
    setSoError("");
    if (!soForm.customer_id) { setSoError("Pilih customer."); return; }
    if (!soItems.some(i => i.product_id && i.quantity && i.unit_id && i.unit_price)) {
      setSoError("Tambahkan minimal satu item."); return;
    }

    setIsSavingSO(true);
    try {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getSession();
      const claims = sessionData?.session?.user;
      if (!claims) throw new Error("Not authenticated");

      const validItems = soItems.filter(i => i.product_id && i.quantity && i.unit_id && i.unit_price);
      const subtotal = validItems.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);

      const { data: soNumber } = await supabase.rpc("get_next_number", { p_org_id: orgId, p_doc_type: "SO" });

      const insertData: Record<string, unknown> = {
        organization_id: orgId,
        so_number: (soNumber as string) || "SO-UNKNOWN",
        customer_id: soForm.customer_id,
        status: "DRAFT",
        order_date: soForm.order_date,
        due_date: soForm.due_date || null,
        subtotal,
        tax_percentage: 0,
        tax_amount: 0,
        discount_percentage: 0,
        discount_amount: 0,
        total_amount: subtotal,
        payment_terms_days: 0,
        notes: soForm.notes || null,
        created_by: claims.sub,
      };

      const { data: soData, error: soErr } = await supabase.from("sales_orders").insert(insertData).select("id").single();
      if (soErr || !soData) throw soErr || new Error("Gagal membuat sales order.");

      const itemInserts = validItems.map(i => ({
        so_id: soData.id,
        product_id: i.product_id,
        quantity: parseFloat(i.quantity),
        unit_id: i.unit_id,
        unit_price: parseFloat(i.unit_price),
      }));

      const { error: itemsErr } = await supabase.from("sales_order_items").insert(itemInserts);
      if (itemsErr) throw itemsErr;

      if (soForm.quotation_id) {
        await supabase.from("quotations").update({ status: "CONVERTED" }).eq("id", soForm.quotation_id);
      }

      const { data: updated } = await supabase
        .from("sales_orders")
        .select("*, so_customer_fk(name, code)")
        .eq("id", soData.id)
        .single();
      if (updated) setOrders(prev => [updated, ...prev]);

      setShowCreateSO(false);
      setSoForm({ customer_id: "", quotation_id: "", order_date: new Date().toISOString().split("T")[0], due_date: "", notes: "" });
      setSoItems([{ product_id: "", quantity: "", unit_id: "", unit_price: "", notes: "" }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setSoError(msg);
    } finally {
      setIsSavingSO(false);
    }
  }

  const statusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    SUBMITTED: { label: "Submitted", tone: "warning" },
    APPROVED: { label: "Disetujui", tone: "info" },
    CONFIRMED: { label: "Dikonfirmasi", tone: "info" },
    PROCESSING: { label: "Diproses", tone: "warning" },
    PICKING: { label: "Dipicking", tone: "warning" },
    SHIPPED: { label: "Dikirim", tone: "info" },
    DELIVERED: { label: "Diterima", tone: "success" },
    CANCELLED: { label: "Dibatalkan", tone: "danger" },
  };

  const lowStockCount = Object.values(stockLevels).filter(s => s.available < s.minimum && s.available > 0).length;
  const outOfStockCount = Object.values(stockLevels).filter(s => s.available === 0).length;

  return (
    <AppShell>
      {lowStockCount > 0 || outOfStockCount > 0 ? (
        <div className="mx-auto max-w-7xl mt-4">
          <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-3 ${outOfStockCount > 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <svg className={`h-5 w-5 shrink-0 ${outOfStockCount > 0 ? "text-red-500" : "text-amber-500"}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className={outOfStockCount > 0 ? "text-red-700" : "text-amber-700"}>
              {outOfStockCount > 0 && <strong>{outOfStockCount} produk habis</strong>}
              {outOfStockCount > 0 && lowStockCount > 0 && " · "}
              {lowStockCount > 0 && <strong>{lowStockCount} produk menipis</strong>}
              {!outOfStockCount && lowStockCount > 0 && <span>Peringatan: {lowStockCount} produk stok menipis. Lihat di Warehouse Inventory.</span>}
              {outOfStockCount > 0 && <span className="text-red-600"> Stok tidak mencukupi untuk beberapa item.</span>}
            </span>
          </div>
        </div>
      ) : null}
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SUPPLY CHAIN"
          title="Penjualan"
          description="Kelola quotation dan sales order."
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowCreateQuotation(true)}>
                Quotation Baru
              </Button>
              <Button variant="primary" size="sm" onClick={() => setShowCreateSO(true)}>
                Sales Order Baru
              </Button>
            </div>
          }
        />

        <div className="mb-6 flex items-center gap-4 border-b border-line">
          <button
            onClick={() => setActiveTab("orders")}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "orders"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            Sales Orders
          </button>
          <button
            onClick={() => setActiveTab("quotations")}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "quotations"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            Quotations
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : activeTab === "orders" ? (
          orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink">Belum ada Sales Order</h3>
              <p className="mt-2 text-sm text-slate-500">Sales order akan muncul setelah dibuat.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor Order</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Tanggal</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {orders.map((order) => {
                      const statusInfo = statusOptions[order.status] || { label: order.status, tone: "neutral" as const };
                      return (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{order.so_number}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-ink">{order.so_customer_fk?.name || "-"}</p>
                            <p className="text-xs text-slate-500">{order.so_customer_fk?.code || "-"}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">{formatDate(order.order_date)}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-ink">{formatCurrency(Number(order.total_amount))}</td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button className="text-xs font-medium text-primary hover:underline">Lihat</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : quotations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada Quotation</h3>
            <p className="mt-2 text-sm text-slate-500">Quotation akan muncul setelah dibuat.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor Quotation</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Tanggal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Berlaku Sampai</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {quotations.map((quote) => {
                    const statusInfo = statusOptions[quote.status] || { label: quote.status, tone: "neutral" as const };
                    return (
                      <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{quote.quotation_number}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink">{quote.qt_customer_fk?.name || "-"}</p>
                          <p className="text-xs text-slate-500">{quote.qt_customer_fk?.code || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{formatDate(quote.quotation_date)}</td>
                        <td className="px-4 py-3 text-sm text-ink">{quote.valid_until ? formatDate(quote.valid_until) : "-"}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-ink">{formatCurrency(Number(quote.total_amount))}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button className="text-xs font-medium text-primary hover:underline">Lihat</button>
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

      {/* Create Quotation Modal */}
      <Modal
        isOpen={showCreateQuotation}
        onClose={() => { setShowCreateQuotation(false); setQuotationError(""); }}
        title="Quotation Baru"
        description="Buat quotation baru untuk customer."
        size="xl"
      >
        <form onSubmit={(e) => void handleCreateQuotation(e)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Customer *"
              options={[{ value: "", label: "Pilih customer" }, ...customers.map(c => ({ value: c.id, label: `${c.code} · ${c.name}` }))]}
              value={quotationForm.customer_id}
              onChange={e => setQuotationForm(f => ({ ...f, customer_id: e.target.value }))}
            />
            <Input
              label="Tanggal Quotation *"
              type="date"
              value={quotationForm.quotation_date}
              onChange={e => setQuotationForm(f => ({ ...f, quotation_date: e.target.value }))}
            />
            <Input
              label="Berlaku Sampai"
              type="date"
              value={quotationForm.valid_until}
              onChange={e => setQuotationForm(f => ({ ...f, valid_until: e.target.value }))}
              hint="Opsional"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-ink">Item Quotation</label>
              <button
                type="button"
                onClick={() => setQuotationItems(prev => [...prev, { product_id: "", quantity: "", unit_id: "", unit_price: "", notes: "" }])}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Tambah Baris
              </button>
            </div>
            <div className="rounded-xl border border-line overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-1/4">Produk *</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-slate-600 w-20">Qty *</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-28">Unit *</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-600 w-28">Harga Unit *</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Catatan</th>
                    <th className="px-3 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {quotationItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <select
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.product_id}
                          onChange={e => { const next = [...quotationItems]; next[idx].product_id = e.target.value; setQuotationItems(next); }}
                        >
                          <option value="">Pilih</option>
                          {products.map(p => { const s = stockLevels[p.id]; return <option key={p.id} value={p.id}>{p.sku} · {p.name}{s ? ` [${s.available} unit${s.available < s.minimum ? ' ⚠' : ''}]` : ''}</option>; })}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9.,]*"
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink text-right focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.quantity}
                          onChange={e => { const next = [...quotationItems]; next[idx].quantity = e.target.value; setQuotationItems(next); }}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.unit_id}
                          onChange={e => { const next = [...quotationItems]; next[idx].unit_id = e.target.value; setQuotationItems(next); }}
                        >
                          <option value="">Pilih</option>
                          {units.map(u => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9.,]*"
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink text-right focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.unit_price}
                          onChange={e => { const next = [...quotationItems]; next[idx].unit_price = e.target.value; setQuotationItems(next); }}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.notes}
                          onChange={e => { const next = [...quotationItems]; next[idx].notes = e.target.value; setQuotationItems(next); }}
                          placeholder="Opsional"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {quotationItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setQuotationItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-danger transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <Textarea
              label="Catatan"
              rows={2}
              value={quotationForm.notes}
              onChange={e => setQuotationForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Catatan opsional untuk quotation"
            />
          </div>

          {quotationError && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 text-xs text-danger">
              {quotationError}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={() => { setShowCreateQuotation(false); setQuotationError(""); }}>
              Batal
            </Button>
            <Button type="submit" loading={isSavingQuotation} variant="primary">
              Simpan Quotation
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Sales Order Modal */}
      <Modal
        isOpen={showCreateSO}
        onClose={() => { setShowCreateSO(false); setSoError(""); }}
        title="Sales Order Baru"
        description="Buat sales order baru."
        size="xl"
      >
        <form onSubmit={(e) => void handleCreateSO(e)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Customer *"
              options={[{ value: "", label: "Pilih customer" }, ...customers.map(c => ({ value: c.id, label: `${c.code} · ${c.name}` }))]}
              value={soForm.customer_id}
              onChange={e => setSoForm(f => ({ ...f, customer_id: e.target.value }))}
            />
            <Input
              label="Tanggal Order *"
              type="date"
              value={soForm.order_date}
              onChange={e => setSoForm(f => ({ ...f, order_date: e.target.value }))}
            />
            <Input
              label="Jatuh Tempo"
              type="date"
              value={soForm.due_date}
              onChange={e => setSoForm(f => ({ ...f, due_date: e.target.value }))}
              hint="Opsional"
            />
            <Select
              label="Ref. Quotation"
              options={[{ value: "", label: "Tidak ada" }, ...quotations.filter(q => q.status === "APPROVED" || q.status === "DRAFT").map(q => ({ value: q.id, label: `${q.quotation_number} · ${q.qt_customer_fk?.name || ""}` }))]}
              value={soForm.quotation_id}
              onChange={e => setSoForm(f => ({ ...f, quotation_id: e.target.value }))}
              hint="Opsional"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-ink">Item Sales Order</label>
              <button
                type="button"
                onClick={() => setSoItems(prev => [...prev, { product_id: "", quantity: "", unit_id: "", unit_price: "", notes: "" }])}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Tambah Baris
              </button>
            </div>
            <div className="rounded-xl border border-line overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-1/4">Produk *</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-slate-600 w-20">Qty *</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-28">Unit *</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-600 w-28">Harga Unit *</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Catatan</th>
                    <th className="px-3 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {soItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <select
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.product_id}
                          onChange={e => { const next = [...soItems]; next[idx].product_id = e.target.value; setSoItems(next); }}
                        >
                          <option value="">Pilih</option>
                          {products.map(p => { const s = stockLevels[p.id]; return <option key={p.id} value={p.id}>{p.sku} · {p.name}{s ? ` [${s.available} unit${s.available < s.minimum ? ' ⚠' : ''}]` : ''}</option>; })}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9.,]*"
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink text-right focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.quantity}
                          onChange={e => { const next = [...soItems]; next[idx].quantity = e.target.value; setSoItems(next); }}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.unit_id}
                          onChange={e => { const next = [...soItems]; next[idx].unit_id = e.target.value; setSoItems(next); }}
                        >
                          <option value="">Pilih</option>
                          {units.map(u => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9.,]*"
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink text-right focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.unit_price}
                          onChange={e => { const next = [...soItems]; next[idx].unit_price = e.target.value; setSoItems(next); }}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className="w-full rounded-[8px] border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
                          value={item.notes}
                          onChange={e => { const next = [...soItems]; next[idx].notes = e.target.value; setSoItems(next); }}
                          placeholder="Opsional"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {soItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSoItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-danger transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <Textarea
              label="Catatan"
              rows={2}
              value={soForm.notes}
              onChange={e => setSoForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Catatan opsional untuk sales order"
            />
          </div>

          {soError && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 text-xs text-danger">
              {soError}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={() => { setShowCreateSO(false); setSoError(""); }}>
              Batal
            </Button>
            <Button type="submit" loading={isSavingSO} variant="primary">
              Simpan Sales Order
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}