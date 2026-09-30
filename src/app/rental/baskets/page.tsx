"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

interface Basket {
  id: string;
  code: string;
  name: string;
  zone: string;
  aisle: string;
  rack: string;
  level: string;
  capacity_kg: number;
  active: boolean;
  cold_storage_id: string;
  cold_storages?: { id: string; code: string; name: string };
  // Current occupancy from rental_allocations
  occupied_kg?: number;
}

interface ColdStorage {
  id: string;
  code: string;
  name: string;
}

type BasketStatus = "EMPTY" | "OCCUPIED" | "RESERVED";

function getBasketStatus(basket: Basket): BasketStatus {
  if (!basket.active) return "RESERVED";
  const occ = basket.occupied_kg ?? 0;
  if (occ <= 0) return "EMPTY";
  if (occ >= basket.capacity_kg) return "OCCUPIED";
  return "RESERVED";
}

const BIN_COLORS: Record<BasketStatus, string> = {
  EMPTY:    "bg-slate-100 border-slate-300 text-slate-400 hover:border-slate-400",
  OCCUPIED: "bg-emerald-100 border-emerald-400 text-emerald-800 hover:bg-emerald-200 cursor-pointer",
  RESERVED: "bg-amber-100 border-amber-400 text-amber-800 hover:bg-amber-200 cursor-pointer",
};

const BIN_BORDER: Record<BasketStatus, string> = {
  EMPTY:    "border-2",
  OCCUPIED: "border-2",
  RESERVED: "border-2",
};

function BasketCell({ basket, onClick }: { basket: Basket; onClick?: () => void }) {
  const status = getBasketStatus(basket);
  const occ = basket.occupied_kg ?? 0;
  const pct = basket.capacity_kg > 0 ? (occ / basket.capacity_kg) * 100 : 0;
  const isClickable = status !== "EMPTY";

  return (
    <button
      type="button"
      disabled={status === "EMPTY"}
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center rounded-xl border-2 p-3 w-full aspect-square transition-all duration-200
        ${BIN_COLORS[status]}
        ${isClickable ? "cursor-pointer shadow-sm" : "cursor-not-allowed opacity-60"}
        ${status === "OCCUPIED" ? "ring-2 ring-emerald-400" : ""}
      `}
    >
      {/* Basket code */}
      <span className="text-[11px] font-bold uppercase tracking-wider mb-0.5">
        {basket.code}
      </span>

      {/* Zone badge */}
      <span className="text-[9px] font-medium bg-white/50 rounded-full px-1.5 py-0.5 mb-1">
        Zone {basket.zone || "A"}
      </span>

      {/* Location */}
      <span className="text-[9px] text-center opacity-70 leading-tight">
        {basket.rack || "-"} / {basket.level || "-"}
      </span>

      {/* Capacity bar */}
      {basket.capacity_kg > 0 && (
        <div className="mt-2 w-full rounded-full h-1.5 bg-white/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              status === "OCCUPIED" ? "bg-emerald-500" : status === "RESERVED" ? "bg-amber-500" : "bg-slate-400"
            }}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}

      {/* Weight label */}
      <span className="text-[9px] font-semibold mt-1">
        {occ > 0 ? `${occ.toFixed(0)} kg` : "Kosong"}
      </span>

      {/* Click hint */}
      {status !== "EMPTY" && (
        <span className="absolute bottom-1 right-1 text-[8px] opacity-40">→</span>
      )}
    </button>
  );
}

export default function BasketsPage() {
  const [coldStorages, setColdStorages] = useState<ColdStorage[]>([]);
  const [selectedCS, setSelectedCS] = useState<string>("");
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Load cold storages on mount
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return;

      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("is_active", "true")
        .maybeSingle();

      if (!membership) return;
      setOrgId(membership.organization_id);

      const { data: csData } = await supabase
        .from("cold_storages")
        .select("id, code, name")
        .eq("organization_id", membership.organization_id)
        .eq("status", "ACTIVE")
        .order("code");

      setColdStorages((csData ?? []) as ColdStorage[]);
      if (csData && csData.length > 0) setSelectedCS(csData[0].id);
    }
    void init();
  }, []);

  // Load baskets when cold storage selected
  useEffect(() => {
    if (!selectedCS || !orgId) return;

    async function loadBaskets() {
      setIsLoading(true);
      const supabase = createClient();

      // Get storage locations for this cold storage
      const { data: locData } = await supabase
        .from("storage_locations")
        .select("*, cold_storages(id, code, name)")
        .eq("cold_storage_id", selectedCS)
        .eq("organization_id", orgId)
        .order("zone")
        .order("aisle")
        .order("rack")
        .order("level");

      // Get current occupancy from rental_allocations
      const { data: allocData } = await supabase
        .from("rental_allocations")
        .select("storage_location_id, active_quantity_kg")
        .eq("cold_storage_id", selectedCS)
        .eq("organization_id", orgId)
        .eq("status", "ACTIVE");

      const occMap: Record<string, number> = {};
      for (const a of (allocData ?? []) as { storage_location_id: string; active_quantity_kg: number }[]) {
        occMap[a.storage_location_id] = (occMap[a.storage_location_id] ?? 0) + Number(a.active_quantity_kg);
      }

      const baskets: Basket[] = ((locData ?? []) as (Basket & { cold_storages: { id: string; code: string; name: string } })[]).map((loc) => ({
        ...loc,
        occupied_kg: occMap[loc.id] ?? 0,
      }));

      setBaskets(baskets);
      setIsLoading(false);
    }
    void loadBaskets();
  }, [selectedCS, orgId]);

  // Group baskets by zone
  const zones = [...new Set(baskets.map((b) => b.zone || "A"))].sort();

  const stats = {
    total: baskets.length,
    empty: baskets.filter((b) => getBasketStatus(b) === "EMPTY").length,
    occupied: baskets.filter((b) => getBasketStatus(b) === "OCCUPIED").length,
    reserved: baskets.filter((b) => getBasketStatus(b) === "RESERVED").length,
    totalKg: baskets.reduce((s, b) => s + (b.occupied_kg ?? 0), 0),
    totalCapacity: baskets.reduce((s, b) => s + b.capacity_kg, 0),
  };

  const selectedCSData = coldStorages.find((cs) => cs.id === selectedCS);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="COLD STORAGE"
          title="Keranjang"
          description="Visual grid keranjang per zona. Hijau = terisi, Abu = kosong, Kuning = sebagian."
        />

        {/* Cold Storage selector + stats */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="w-64">
            <Select
              label="Cold Storage"
              value={selectedCS}
              onChange={(e) => setSelectedCS(e.target.value)}
              options={coldStorages.map((cs) => ({
                value: cs.id,
                label: `${cs.code} — ${cs.name},
              }))}
            />
          </div>

          {selectedCSData && (
            <div className="flex items-center gap-3 ml-4">
              <StatBadge label="Total" value={stats.total} color="slate" />
              <StatBadge label="Kosong" value={stats.empty} color="emerald" />
              <StatBadge label="Terisi" value={stats.occupied} color="emerald" />
              <StatBadge label="Sebagian" value={stats.reserved} color="amber" />
              <StatBadge
                label="Isi"
                value={`${stats.totalKg.toFixed(0)} / ${stats.totalCapacity.toFixed(0)} kg`}
                color="slate"
              />
            </div>
          )}
        </div>

        {/* Basket grid by zone */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : baskets.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {zones.map((zone) => {
              const zoneBaskets = baskets.filter((b) => b.zone === zone || (!b.zone && zone === "A"));
              const zoneStats = {
                total: zoneBaskets.length,
                empty: zoneBaskets.filter((b) => getBasketStatus(b) === "EMPTY").length,
                occupied: zoneBaskets.filter((b) => getBasketStatus(b) === "OCCUPIED").length,
                reserved: zoneBaskets.filter((b) => getBasketStatus(b) === "RESERVED").length,
              };
              return (
                <div key={zone}>
                  {/* Zone header */}
                  <div className="mb-3 flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-ink">Zone {zone}</h3>
                    <div className="flex gap-2 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 inline-block" />{zoneStats.occupied}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400 inline-block" />{zoneStats.reserved}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />{zoneStats.empty}
                      </span>
                    </div>
                  </div>

                  {/* Grid */}
                  <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
                    {zoneBaskets.map((basket) => (
                      <BasketCell
                        key={basket.id}
                        basket={basket}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string | number; color: "slate" | "emerald" | "amber" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
  };
  return (
    <div className={`flex flex-col items-center rounded-xl border px-4 py-2 text-center ${colors[color]}}>
      <span className="text-xs font-medium text-current opacity-60">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
      {[...Array(24)].map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-200" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
      <p className="text-sm text-slate-500">Belum ada keranjang untuk cold storage ini.</p>
      <p className="mt-1 text-xs text-slate-400">Tambahkan keranjang di pengaturan storage.</p>
    </div>
  );
}
