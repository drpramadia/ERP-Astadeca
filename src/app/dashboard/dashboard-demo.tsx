"use client";

import { useSyncExternalStore, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime, formatNumber, formatKg } from "@/lib/utils";
import { dashboardDemoData, type DashboardDemoData } from "@/lib/dashboard/demo-data";

const changeEvent = "astadeca-dashboard-demo-change";
const cache = new Map<string, { raw: string | null | undefined; value: DashboardDemoData | null }>();

function getSnapshot(key: string) {
  if (typeof window === "undefined") return dashboardDemoData;
  const raw = window.localStorage.getItem(key);
  const existing = cache.get(key);
  if (existing?.raw === raw) return existing.value;
  let value: DashboardDemoData | null = dashboardDemoData;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as DashboardDemoData | null;
    } catch {
      value = dashboardDemoData;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function subscribe(key: string, callback: () => void) {
  const notify = (event: Event) => {
    if (event instanceof StorageEvent && event.key !== key) return;
    cache.delete(key);
    callback();
  };
  window.addEventListener("storage", notify);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changeEvent, notify);
  };
}

function storeDemo(key: string, value: DashboardDemoData | null) {
  window.localStorage.setItem(key, JSON.stringify(value));
  cache.set(key, { raw: window.localStorage.getItem(key), value });
  window.dispatchEvent(new Event(changeEvent));
}

function clearDemo(key: string) {
  window.localStorage.removeItem(key);
  cache.delete(key);
  window.dispatchEvent(new Event(changeEvent));
}

function initialForm(data: DashboardDemoData) {
  return {
    availableStockKg: String(data.availableStockKg),
    quarantineStockKg: String(data.quarantineStockKg),
    pendingApprovals: String(data.pendingApprovals),
    capacityCs01: String(data.coldStorages.find((storage) => storage.code === "CS-01")?.capacityKg ?? 0),
    occupiedCs01: String(data.coldStorages.find((storage) => storage.code === "CS-01")?.occupiedKg ?? 0),
    capacityCs02: String(data.coldStorages.find((storage) => storage.code === "CS-02")?.capacityKg ?? 0),
    occupiedCs02: String(data.coldStorages.find((storage) => storage.code === "CS-02")?.occupiedKg ?? 0),
  };
}

export function DashboardDemo({
  organizationId,
  organizationName,
  fullName,
  databaseError,
}: {
  organizationId: string;
  organizationName: string;
  fullName: string;
  databaseError: string;
}) {
  const router = useRouter();
  const storageKey = `astadeca-dashboard-demo:${organizationId}`;
  const data = useSyncExternalStore(
    (callback) => subscribe(storageKey, callback),
    () => getSnapshot(storageKey),
    () => dashboardDemoData,
  );
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => initialForm(dashboardDemoData));
  const [error, setError] = useState<string | null>(null);

  function openEditor() {
    if (!data) return;
    setForm(initialForm(data));
    setError(null);
    setEditing(true);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)])) as Record<keyof typeof form, number>;
    if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Masukkan angka nol atau lebih.");
      return;
    }
    if (values.occupiedCs01 > values.capacityCs01 || values.occupiedCs02 > values.capacityCs02) {
      setError("Stok terpakai tidak boleh melebihi kapasitas.");
      return;
    }
    storeDemo(storageKey, {
      ...data,
      availableStockKg: values.availableStockKg,
      quarantineStockKg: values.quarantineStockKg,
      pendingApprovals: values.pendingApprovals,
      coldStorages: data.coldStorages.map((storage) => storage.code === "CS-01"
        ? { ...storage, capacityKg: values.capacityCs01, occupiedKg: values.occupiedCs01 }
        : storage.code === "CS-02"
          ? { ...storage, capacityKg: values.capacityCs02, occupiedKg: values.occupiedCs02 }
          : storage),
    });
    setEditing(false);
  }

  const totalStock = data ? data.availableStockKg + data.quarantineStockKg : 0;
  const availableStorage = data?.coldStorages.reduce((total, storage) => total + storage.capacityKg - storage.occupiedKg, 0) ?? 0;
  const occupiedStorage = data?.coldStorages.reduce((total, storage) => total + storage.occupiedKg, 0) ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="ASTADECA"
          title="Ringkasan Operasional"
          description="Pantau persediaan, cold storage, pembelian, penjualan, pengiriman, dan aktivitas operasional."
          actions={<div className="flex flex-wrap items-center gap-2"><StatusBadge tone="info">{organizationName}</StatusBadge><StatusBadge tone="success">{fullName}</StatusBadge></div>}
        />
        <section aria-label="Data demo" className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y border-amber-300 bg-amber-50 px-4 py-3">
          <div className="min-w-0"><p className="text-sm font-semibold text-amber-950">MODE DEMO · Bukan transaksi database</p><p className="mt-0.5 text-xs text-amber-900">{databaseError} Demo disimpan di browser ini, terpisah dari stock ledger; gunakan aksi Muat data real setelah schema tersedia.</p></div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => router.refresh()}>Muat data real</Button>
            {data && <Button size="sm" variant="secondary" onClick={openEditor}>Edit demo</Button>}
            {data ? <Button size="sm" variant="danger" onClick={() => storeDemo(storageKey, null)}>Hapus demo</Button> : <Button size="sm" onClick={() => clearDemo(storageKey)}>Pulihkan demo awal</Button>}
          </div>
        </section>

        {data ? <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total Persediaan" value={formatNumber(totalStock)} unit="KG" description="Ringkasan demo" />
            <KpiCard label="Stok Tersedia" value={formatNumber(data.availableStockKg)} unit="KG" description="Siap diproses" />
            <KpiCard label="Quarantine" value={formatNumber(data.quarantineStockKg)} unit="KG" description="Menunggu QC release" />
            <KpiCard label="Menunggu Persetujuan" value={data.pendingApprovals} unit="Dokumen" description="Butuh otorisasi" />
          </div>

          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-ink">Cold Storage</h2><p className="text-sm text-slate-500">Terpakai {formatKg(occupiedStorage)} · tersedia {formatKg(availableStorage)}</p></div><a href="/warehouse" className="text-sm font-medium text-primary hover:underline">Kelola</a></div>
            <div className="grid gap-4 xl:grid-cols-2">
              {data.coldStorages.map((storage) => {
                const utilization = storage.capacityKg > 0 ? storage.occupiedKg / storage.capacityKg * 100 : 0;
                return <article key={storage.id} className="border-b border-line bg-white py-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-slate-500">{storage.code}</p><h3 className="mt-1 text-lg font-semibold text-ink">{storage.name}</h3></div><StatusBadge tone={utilization >= 90 ? "danger" : utilization >= 75 ? "warning" : "success"}>{utilization.toFixed(1)}%</StatusBadge></div><p className="mt-4 text-sm text-slate-500">{formatKg(storage.occupiedKg)} dari {formatKg(storage.capacityKg)}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-success" style={{ width: `${Math.min(utilization, 100)}%` }} /></div><p className="mt-2 text-xs text-slate-500">Sisa {formatKg(storage.capacityKg - storage.occupiedKg)}</p></article>;
              })}
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4"><h2 className="text-lg font-semibold text-ink">Aktivitas Terbaru</h2><p className="text-sm text-slate-500">Contoh movement untuk demonstrasi.</p></div>
            {data.recentMovements.length ? <div className="divide-y divide-line rounded-xl border border-line bg-white px-4">{data.recentMovements.map((movement) => <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><StatusBadge tone={movement.type === "RECEIVE" ? "success" : "warning"}>{movement.type}</StatusBadge><p className="mt-1 text-sm font-medium text-ink">{movement.product}</p><p className="text-xs text-slate-500">Batch {movement.batch} · {movement.actor}</p></div><div className="text-right"><p className="text-sm font-semibold">{formatKg(movement.quantityKg)}</p><p className="text-xs text-slate-500">{formatDateTime(movement.date)}</p></div></div>)}</div> : <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">Tidak ada aktivitas demo.</p>}
          </section>
        </> : <section className="rounded-xl border border-dashed border-line bg-white p-12 text-center"><h2 className="text-lg font-semibold text-ink">Data demo dihapus</h2><p className="mt-2 text-sm text-slate-500">Dashboard belum memiliki data real. Pulihkan contoh demo atau muat ulang setelah database siap.</p><div className="mt-4 flex justify-center gap-2"><Button onClick={() => clearDemo(storageKey)}>Pulihkan demo awal</Button><Button variant="secondary" onClick={() => router.refresh()}>Muat data real</Button></div></section>}
      </div>

      <Modal isOpen={editing} onClose={() => setEditing(false)} title="Edit data demo" description="Perubahan hanya berlaku untuk browser ini dan tidak mengubah stock ledger." size="lg">
        {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><Input label="Stok tersedia (KG)" type="number" min="0" value={form.availableStockKg} onChange={(event) => setForm((current) => ({ ...current, availableStockKg: event.target.value }))} /><Input label="Quarantine (KG)" type="number" min="0" value={form.quarantineStockKg} onChange={(event) => setForm((current) => ({ ...current, quarantineStockKg: event.target.value }))} /><Input label="Approval pending" type="number" min="0" step="1" value={form.pendingApprovals} onChange={(event) => setForm((current) => ({ ...current, pendingApprovals: event.target.value }))} /><Input label="CS-01 kapasitas (KG)" type="number" min="0" value={form.capacityCs01} onChange={(event) => setForm((current) => ({ ...current, capacityCs01: event.target.value }))} /><Input label="CS-01 terpakai (KG)" type="number" min="0" value={form.occupiedCs01} onChange={(event) => setForm((current) => ({ ...current, occupiedCs01: event.target.value }))} /><Input label="CS-02 kapasitas (KG)" type="number" min="0" value={form.capacityCs02} onChange={(event) => setForm((current) => ({ ...current, capacityCs02: event.target.value }))} /><Input label="CS-02 terpakai (KG)" type="number" min="0" value={form.occupiedCs02} onChange={(event) => setForm((current) => ({ ...current, occupiedCs02: event.target.value }))} /></div>
          <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Batal</Button><Button type="submit">Simpan demo</Button></div>
        </form>
      </Modal>
    </AppShell>
  );
}
