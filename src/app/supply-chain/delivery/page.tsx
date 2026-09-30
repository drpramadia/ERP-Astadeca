"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/utils";

interface DeliveryOrder {
  id: string;
  do_number: string;
  sales_order_id?: string;
  customer_id: string;
  status: string;
  delivery_date?: string;
  vehicle_number?: string;
  driver_name?: string;
  recipient_name?: string;
  recipient_address?: string;
  pod_received_at?: string;
  pod_recipient_signature?: string;
  pod_notes?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  // embedded relations (use FK name to avoid ambiguity)
  delivery_orders_customer_fk?: { name: string; code: string };
  sales_orders?: { order_number: string };
}

interface CreateForm {
  customerId: string;
  deliveryDate: string;
  notes: string;
}

const EMPTY_FORM: CreateForm = { customerId: "", deliveryDate: "", notes: "" };

export default function DeliveryPage() {
  const { userId, loaded } = useSession();
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auth guard
  useEffect(() => {
    if (loaded && !userId) {
      router.replace("/login");
    }
  }, [loaded, userId, router]);

  const fetchData = useCallback(async (orgId: string) => {
    const supabase = createClient();
    const [{ data: deliveryData }, { data: customerData }] = await Promise.all([
      supabase
        .from("delivery_orders")
        .select("*, do_customer_fk(name, code), sales_orders(order_number)")
        .eq("organization_id", orgId)
        .order("delivery_date", { ascending: false })
        .limit(50),
      supabase
        .from("customers")
        .select("id, code, name")
        .eq("organization_id", orgId)
        .eq("active", true)
        .order("name"),
    ]);
    setDeliveries((deliveryData as DeliveryOrder[]) || []);
    setCustomers((customerData as Array<{ id: string; code: string; name: string }>) || []);
  }, []);

  useEffect(() => {
    if (!userId) return;
    async function init() {
      const supabase = createClient();
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (membership) {
        await fetchData(membership.organization_id);
      }
      setIsLoading(false);
    }
    init();
  }, [userId, fetchData]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data: membership } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (membership) await fetchData(membership.organization_id);
  }, [userId, fetchData]);

  const handleOpenCreate = useCallback(() => {
    setCreateForm(EMPTY_FORM);
    setActionMessage(null);
    setShowCreateModal(true);
  }, []);

  const handleCreateDeliveryOrder = useCallback(async () => {
    if (!createForm.customerId || !createForm.deliveryDate) {
      setActionMessage({ type: "error", text: "Customer dan tanggal jadwal wajib diisi." });
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    try {
      const supabase = createClient();
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (!membership) throw new Error("Tidak ditemukan keanggotaan aktif.");

      const { error } = await supabase.from("delivery_orders").insert({
        organization_id: membership.organization_id,
        customer_id: createForm.customerId,
        status: "DRAFT",
        delivery_date: createForm.deliveryDate || null,
        notes: createForm.notes || null,
      });

      if (error) throw error;
      setShowCreateModal(false);
      await refresh();
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Gagal membuat delivery order." });
    } finally {
      setActionLoading(false);
    }
  }, [createForm, userId, refresh]);

  const handleViewDelivery = useCallback((delivery: DeliveryOrder) => {
    setSelectedDelivery(delivery);
    setShowDetailModal(true);
  }, []);

  const handleShipDelivery = useCallback(async (delivery: DeliveryOrder) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("delivery_orders")
        .update({ status: "IN_TRANSIT", delivery_date: new Date().toISOString().slice(0, 10) })
        .eq("id", delivery.id);

      if (error) throw error;
      await refresh();
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Gagal mengirim delivery order." });
    } finally {
      setActionLoading(false);
    }
  }, [refresh]);

  const statusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    READY: { label: "Siap", tone: "warning" },
    IN_TRANSIT: { label: "Perjalanan", tone: "info" },
    DELIVERED: { label: "Diterima", tone: "success" },
    FAILED: { label: "Gagal", tone: "danger" },
    CANCELLED: { label: "Dibatalkan", tone: "neutral" },
  };

  if (!loaded) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Memuat...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SUPPLY CHAIN"
          title="Pengiriman"
          description="Kelola delivery order dan tracking pengiriman."
          actions={
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Delivery Order Baru
            </Button>
          }
        />

        {actionMessage && (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${actionMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
            }}>
            {actionMessage.text}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada delivery order</h3>
            <p className="mt-2 text-sm text-slate-500">
              Delivery order akan muncul setelah ada penjualan yang siap dikirim.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor DO</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Sales Order</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Jadwal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Penerima</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {deliveries.map((delivery) => {
                    const statusInfo = statusOptions[delivery.status] || { label: delivery.status, tone: "neutral" as const };
                    return (
                      <tr key={delivery.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{delivery.do_number}</td>
                        <td className="px-4 py-3 text-sm text-ink">{delivery.sales_orders?.order_number || "-"}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink">{delivery.delivery_orders_customer_fk?.name || "−"}</p>
                          <p className="text-xs text-slate-500">{delivery.delivery_orders_customer_fk?.code || "−"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">
                          {delivery.delivery_date ? formatDate(delivery.delivery_date) : "−"}
                          {delivery.pod_received_at && <br />}
                          {delivery.pod_received_at && <span className="text-xs text-slate-500">Diterima: {formatDate(delivery.pod_received_at)}</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{delivery.recipient_name || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleViewDelivery(delivery)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Lihat
                            </button>
                            {delivery.status === "READY" && (
                              <button
                                onClick={() => handleShipDelivery(delivery)}
                                disabled={actionLoading}
                                className="text-xs font-medium text-success hover:underline disabled:opacity-50"
                              >
                                Kirim
                              </button>
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

      {/* Create Delivery Order Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Delivery Order Baru"
        description="Isi informasi dasar untuk membuat delivery order baru."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Customer <span className="text-red-500">*</span></label>
            <select
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={createForm.customerId}
              onChange={(e) => setCreateForm((f) => ({ ...f, customerId: e.target.value }))}
            >
              <option value="">Pilih customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
              ))}
            </select>
          </div>
          <Input
            label="Tanggal Jadwal"
            type="date"
            value={createForm.deliveryDate}
            onChange={(e) => setCreateForm((f) => ({ ...f, deliveryDate: e.target.value }))}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Catatan</label>
            <textarea
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              value={createForm.notes}
              onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Catatan opsional untuk delivery order..."
            />
          </div>
          {actionMessage && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${actionMessage.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
              }}>
              {actionMessage.text}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCreateModal(false)}>Batal</Button>
            <Button variant="primary" size="sm" loading={actionLoading} onClick={handleCreateDeliveryOrder}>
              Buat Delivery Order
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delivery Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={selectedDelivery ? `Detail: ${selectedDelivery.do_number} : "Detail Delivery Order"}
        size="lg"
      >
        {selectedDelivery && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Nomor DO</p>
                <p className="font-mono font-medium text-ink">{selectedDelivery.do_number}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <StatusBadge tone={statusOptions[selectedDelivery.status]?.tone || "neutral"}>
                  {statusOptions[selectedDelivery.status]?.label || selectedDelivery.status}
                </StatusBadge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Customer</p>
                <p className="font-medium text-ink">{selectedDelivery.delivery_orders_customer_fk?.name || "−"}</p>
                <p className="text-xs text-slate-500">{selectedDelivery.delivery_orders_customer_fk?.code || ""}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sales Order</p>
                <p className="font-medium text-ink">{selectedDelivery.sales_orders?.order_number || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Jadwal</p>
                <p className="text-ink">{selectedDelivery.delivery_date ? formatDate(selectedDelivery.delivery_date) : "−"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Penerima</p>
                <p className="text-ink">{selectedDelivery.recipient_name || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Dikirim</p>
                <p className="text-ink">{selectedDelivery.delivery_date ? formatDate(selectedDelivery.delivery_date) : "−"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Diterima</p>
                <p className="text-ink">{selectedDelivery.pod_received_at ? formatDate(selectedDelivery.pod_received_at) : "−"}</p>
              </div>
            </div>
            {selectedDelivery.notes && (
              <div>
                <p className="text-xs text-slate-500">Catatan</p>
                <p className="text-sm text-ink">{selectedDelivery.notes}</p>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setShowDetailModal(false)}>Tutup</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
