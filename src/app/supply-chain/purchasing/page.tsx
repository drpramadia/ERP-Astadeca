"use strict"
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_date?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  suppliers?: { name: string; code: string };
}

interface PurchaseRequest {
  id: string;
  pr_number: string;
  requester_id: string;
  status: string;
  request_date: string;
  needed_date?: string;
  notes?: string;
  profiles?: { full_name?: string };
}

export default function PurchasingPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "requests">("orders");
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [showCreatePR, setShowCreatePR] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: "", orderDate: new Date().toISOString().split("T")[0], expectedDate: "", notes: "" });
  const [poLines, setPoLines] = useState<any[]>([{ productId: "", quantity: "", unitId: "", unitPrice: "" }]);
  const [prForm, setPrForm] = useState({ supplierId: "", requestDate: new Date().toISOString().split("T")[0], neededDate: "", notes: "" });
  const [prLines, setPrLines] = useState<any[]>([{ productId: "", quantity: "", unitId: "" }]);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<string>("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getClaims();
      const claims = claimsData?.claims;
      if (!claims) return;

      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", claims.sub)
        .eq("is_active", true)
        .maybeSingle();

      if (!membership) return;
      const [ordersRes, requestsRes] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("*, suppliers(name, code)")
          .eq("organization_id", membership.organization_id)
          .order("order_date", { ascending: false })
          .limit(50),
        supabase
          .from("purchase_requests")
          .select("*, profiles(full_name)")
          .eq("organization_id", membership.organization_id)
          .order("request_date", { ascending: false })
          .limit(50),
      ]);

      setOrders((ordersRes as any)?.data || []);
      setRequests((requestsRes as any)?.data || []);
      setOrgId(membership.organization_id);
      setUserId(claims.sub);

      // Load suppliers and products
      const [suppliersRes, productsRes, unitsRes] = await Promise.all([
        supabase.from("suppliers").select("id, code, name").eq("organization_id", membership.organization_id).order("name"),
        supabase.from("products").select("id, sku, name, unit_id").eq("organization_id", membership.organization_id).order("name"),
        supabase.from("units").select("id, code, name").eq("active", true).order("code"),
      ]);
      setSuppliers((suppliersRes as any)?.data || []);
      setProducts((productsRes as any)?.data || []);
      setUnits((unitsRes as any)?.data || []);
      setIsLoading(false);
    }
    init();
  }, []);

  const statusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    SUBMITTED: { label: "Submitted", tone: "warning" },
    PENDING_APPROVAL: { label: "Menunggu", tone: "warning" },
    APPROVED: { label: "Disetujui", tone: "info" },
    ORDERED: { label: "Dipesan", tone: "info" },
    PARTIALLY_RECEIVED: { label: "Sebagian", tone: "warning" },
    RECEIVED: { label: "Diterima", tone: "success" },
    CANCELLED: { label: "Dibatalkan", tone: "danger" },
  };

  async function handleCreatePO() {
    if (!poForm.supplierId || poLines.length === 0 || !orgId || !userId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const items = poLines.filter(l => l.productId && l.quantity).map(l => ({
        product_id: l.productId,
        quantity: parseFloat(l.quantity),
        unit_id: l.unitId || null,
        unit_price: parseFloat(l.unitPrice) || null,
        notes: "",
      }));
      const { error } = await supabase.rpc("create_po_draft", {
        p_org_id: orgId,
        p_supplier_id: poForm.supplierId,
        p_order_date: poForm.orderDate,
        p_expected_date: poForm.expectedDate || null,
        p_items: items,
        p_notes: poForm.notes,
        p_created_by: userId,
      } as Record<string, unknown>);
      if (error) throw error;
      setShowCreatePO(false);
      setPoForm({ supplierId: "", orderDate: new Date().toISOString().split("T")[0], expectedDate: "", notes: "" });
      setPoLines([{ productId: "", quantity: "", unitId: "", unitPrice: "" }]);
      window.location.reload();
    } catch (e: any) {
      alert("Gagal membuat PO: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitPO(poId: string) {
    setActingId(poId);
    setActionType("submit");
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("submit_po", { p_po_id: poId, p_submitted_by: userId } as Record<string, unknown>);
      if (error) throw error;
      window.location.reload();
    } catch (e: any) {
      alert("Gagal submit: " + (e?.message || e));
      setActingId(null);
    }
  }

  async function handleCancelPO(poId: string) {
    if (!confirm("Batalkan PO ini?")) return;
    setActingId(poId);
    setActionType("cancel");
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("cancel_po", { p_po_id: poId, p_cancelled_by: userId, p_reason: "Cancelled by user" } as Record<string, unknown>);
      if (error) throw error;
      window.location.reload();
    } catch (e: any) {
      alert("Gagal cancel: " + (e?.message || e));
      setActingId(null);
    }
  }

  async function handleCreatePR() {
    if (!prForm.supplierId || prLines.length === 0 || !orgId || !userId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const items = prLines.filter(l => l.productId && l.quantity).map(l => ({
        product_id: l.productId,
        quantity: parseFloat(l.quantity),
        unit_id: l.unitId || null,
        notes: "",
      }));
      const { error } = await supabase.rpc("create_pr_draft", {
        p_org_id: orgId,
        p_supplier_id: prForm.supplierId || null,
        p_request_date: prForm.requestDate,
        p_needed_date: prForm.neededDate || null,
        p_items: items,
        p_notes: prForm.notes || "",
        p_requester_id: userId,
      } as Record<string, unknown>);
      if (error) throw error;
      setShowCreatePR(false);
      window.location.reload();
    } catch (e: any) {
      alert("Gagal membuat PR: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function addPOLine() { setPoLines([...poLines, { productId: "", quantity: "", unitId: "", unitPrice: "" }]); }
  function removePOLine(i: number) { setPoLines(poLines.filter((_, idx) => idx !== i)); }
  function updatePOLine(i: number, field: string, val: string) {
    const updated = [...poLines];
    (updated[i] as any)[field] = val;
    setPoLines(updated);
  }
  function addPRLine() { setPrLines([...prLines, { productId: "", quantity: "", unitId: "" }]); }
  function removePRLine(i: number) { setPrLines(prLines.filter((_, idx) => idx !== i)); }
  function updatePRLine(i: number, field: string, val: string) {
    const updated = [...prLines];
    (updated[i] as any)[field] = val;
    setPrLines(updated);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SUPPLY CHAIN"
          title="Pembelian"
          description="Kelola purchase order dan purchase request."
          actions={
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => setShowCreatePO(true)}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Purchase Order Baru
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
            Purchase Orders
          </button>
          <button
            onClick={() => setActiveTab("requests")}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "requests"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            Purchase Requests
          </button>
          <div className="ml-auto">
            <Button variant="primary" size="sm" onClick={() => setShowCreatePR(true)}>+ PR Baru</Button>
          </div>
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
              <h3 className="mt-4 text-base font-semibold text-ink">Belum ada Purchase Order</h3>
              <p className="mt-2 text-sm text-slate-500">Purchase order akan muncul setelah dibuat.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor PO</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Supplier</th>
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
                          <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{order.po_number}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-ink">{order.suppliers?.name || "-"}</p>
                            <p className="text-xs text-slate-500">{order.suppliers?.code || "-"}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">{formatDate(order.order_date)}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-ink">{formatCurrency(Number(order.total_amount))}</td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button className="text-xs font-medium text-primary hover:underline">Lihat</button>
                              {order.status === "DRAFT" && (
                                <>
                                  <button
                                    onClick={() => void handleSubmitPO(order.id)}
                                    disabled={actingId === order.id}
                                    className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50"
                                  >
                                    {actingId === order.id && actionType === "submit" ? "..." : "Submit"}
                                  </button>
                                  <button
                                    onClick={() => void handleCancelPO(order.id)}
                                    disabled={actingId === order.id}
                                    className="text-xs font-medium text-red-500 hover:underline disabled:opacity-50"
                                  >
                                    {actingId === order.id && actionType === "cancel" ? "..." : "Batal"}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada Purchase Request</h3>
            <p className="mt-2 text-sm text-slate-500">Purchase request akan muncul setelah dibuat.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor PR</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Pemohon</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Tanggal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Butuh Tanggal</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {requests.map((request) => {
                    const statusInfo = statusOptions[request.status] || { label: request.status, tone: "neutral" as const };
                    return (
                      <tr key={request.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{request.pr_number}</td>
                        <td className="px-4 py-3 text-sm font-medium text-ink">{request.profiles?.full_name || "-"}</td>
                        <td className="px-4 py-3 text-sm text-ink">{formatDate(request.request_date)}</td>
                        <td className="px-4 py-3 text-sm text-ink">{request.needed_date ? formatDate(request.needed_date) : "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button className="text-xs font-medium text-primary hover:underline">Lihat</button>
                            {request.status === "DRAFT" && (
                              <button className="text-xs font-medium text-slate-500 hover:underline">Edit</button>
                            )}
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

      {showCreatePO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-white border-b border-line px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Purchase Order Baru</h2>
              <button onClick={() => setShowCreatePO(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
                  <select className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    value={poForm.supplierId} onChange={e => setPoForm({...poForm, supplierId: e.target.value})}>
                    <option value="">Pilih supplier</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal PO</label>
                  <input type="date" className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                    value={poForm.orderDate} onChange={e => setPoForm({...poForm, orderDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tgl. Perkiraan Terima</label>
                  <input type="date" className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                    value={poForm.expectedDate} onChange={e => setPoForm({...poForm, expectedDate: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
                <textarea className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                  value={poForm.notes} onChange={e => setPoForm({...poForm, notes: e.target.value})} rows={2} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Item PO</label>
                  <button onClick={addPOLine} className="text-xs text-primary hover:underline">+ Tambah Baris</button>
                </div>
                <div className="border border-line rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-line">
                        <th className="px-2 py-2 text-left font-medium text-slate-600">Produk</th>
                        <th className="px-2 py-2 text-right font-medium text-slate-600 w-24">Qty</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-600 w-20">Satuan</th>
                        <th className="px-2 py-2 text-right font-medium text-slate-600 w-32">Harga</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {poLines.map((line, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="p-1">
                            <select className="w-full rounded border border-line bg-white px-2 py-1"
                              value={line.productId} onChange={e => updatePOLine(i, "productId", e.target.value)}>
                              <option value="">Pilih</option>
                              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                            </select>
                          </td>
                          <td className="p-1"><input type="text" className="w-full rounded border border-line px-2 py-1 text-right" value={line.quantity} onChange={e => updatePOLine(i, "quantity", e.target.value)} placeholder="0" pattern="[0-9.,]*" /></td>
                          <td className="p-1"><select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={line.unitId || ""} onChange={e => updatePOLine(i, "unitId", e.target.value)}><option value="">-</option>{units.map(u => <option key={u.id} value={u.id}>{u.code}</option>)}</select></td>
                          <td className="p-1"><input type="text" className="w-full rounded border border-line px-2 py-1 text-right" value={line.unitPrice} onChange={e => updatePOLine(i, "unitPrice", e.target.value)} placeholder="0" pattern="[0-9.,]*" /></td>
                          <td className="p-1 text-center">
                            {poLines.length > 1 && <button onClick={() => removePOLine(i)} className="text-red-400 hover:text-red-600 text-sm">x</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
              <button onClick={() => setShowCreatePO(false)} className="px-4 py-2 rounded-lg border border-line text-sm text-slate-600 hover:bg-slate-50">Batal</button>
              <button onClick={() => void handleCreatePO()} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50">
                {saving ? "Menyimpan..." : "Simpan Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreatePR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-white border-b border-line px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Purchase Request Baru</h2>
              <button onClick={() => setShowCreatePR(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
                  <select className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    value={prForm.supplierId} onChange={e => setPrForm({...prForm, supplierId: e.target.value})}>
                    <option value="">Pilih supplier</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tgl Request</label>
                  <input type="date" className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                    value={prForm.requestDate} onChange={e => setPrForm({...prForm, requestDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tgl Dibutuhkan</label>
                  <input type="date" className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                    value={prForm.neededDate} onChange={e => setPrForm({...prForm, neededDate: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
                <textarea className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                  value={prForm.notes} onChange={e => setPrForm({...prForm, notes: e.target.value})} rows={2} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Item PR</label>
                  <button onClick={addPRLine} className="text-xs text-primary hover:underline">+ Tambah Baris</button>
                </div>
                <div className="border border-line rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-line">
                        <th className="px-2 py-2 text-left font-medium text-slate-600">Produk</th>
                        <th className="px-2 py-2 text-right font-medium text-slate-600 w-32">Qty</th>
                        <th className="px-2 py-2 text-left font-medium text-slate-600 w-20">Satuan</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {prLines.map((line, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="p-1">
                            <select className="w-full rounded border border-line bg-white px-2 py-1"
                              value={line.productId} onChange={e => updatePRLine(i, "productId", e.target.value)}>
                              <option value="">Pilih</option>
                              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                            </select>
                          </td>
                          <td className="p-1"><input type="text" className="w-full rounded border border-line px-2 py-1 text-right" value={line.quantity} onChange={e => updatePRLine(i, "quantity", e.target.value)} placeholder="0" pattern="[0-9.,]*" /></td>
                          <td className="p-1"><select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={line.unitId || ""} onChange={e => updatePRLine(i, "unitId", e.target.value)}><option value="">-</option>{units.map(u => <option key={u.id} value={u.id}>{u.code}</option>)}</select></td>
                          <td className="p-1 text-center">
                            {prLines.length > 1 && <button onClick={() => removePRLine(i)} className="text-red-400 hover:text-red-600 text-sm">x</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
              <button onClick={() => setShowCreatePR(false)} className="px-4 py-2 rounded-lg border border-line text-sm text-slate-600 hover:bg-slate-50">Batal</button>
              <button onClick={() => void handleCreatePR()} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50">
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}