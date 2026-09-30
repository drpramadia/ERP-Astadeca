"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldShell } from "@/components/field-shell";
import { createClient } from "@/lib/supabase/client";

interface FieldUser {
  fullName: string;
  roleName: string;
  roleCode: string;
}

export default function FieldPage() {
  const router = useRouter();
  const [user, setUser] = useState<FieldUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) { router.push("/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("role_id, roles!inner(code, name)")
        .eq("user_id", userId)
        .eq("is_active", "true")
        .maybeSingle();

      if (!membership) { router.push("/login"); return; }

      const raw = membership as unknown as { roles?: { code?: string; name?: string } };
      setUser({
        fullName: profile?.full_name || sessionData.session?.user?.email?.split("@")[0] || "Petugas",
        roleName: raw.roles?.name || "Field",
        roleCode: raw.roles?.code || "",
      });
      setLoading(false);
    }
    void load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-amber-300 border-t-amber-600" />
          <p className="text-sm text-slate-400">Memuat...</p>
        </div>
      </div>
    );
  }

  return (
    <FieldShell title="Menu Utama">
      <div className="space-y-3">

        {/* Greeting */}
        <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 p-4 text-white shadow-lg shadow-amber-200/50">
          <p className="text-xs font-medium opacity-80">Selamat datang,</p>
          <h2 className="mt-0.5 text-xl font-bold">{user?.fullName}</h2>
          <p className="mt-0.5 text-xs opacity-70">{user?.roleName}</p>
        </div>

        {/* Flow cards */}
        <div className="grid grid-cols-1 gap-3">
          {/* Penerimaan Barang — available to WAREHOUSE & QC */}
          <FlowCard
            href="/supply-chain/receiving"
            icon={
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            }
            label="Penerimaan Barang"
            sublabel="Terima & konfirmasi PO masuk"
            color="amber"
          />

          {/* QC Inspection — available to QC only */}
          {user?.roleCode === "QC" && (
            <FlowCard
              href="/supply-chain/qc"
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              }
              label="QC Inspection"
              sublabel="Periksa & setujui barang masuk"
              color="teal"
            />
          )}

          {/* Pengiriman / Delivery — available to WAREHOUSE */}
          {user?.roleCode === "WAREHOUSE" && (
            <FlowCard
              href="/supply-chain/delivery"
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
              }
              label="Pengiriman"
              sublabel="Siapkan & kirim barang keluar"
              color="blue"
            />
          )}
        </div>

        {/* Info strip */}
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-400">
            Tanggal hari ini: {new Date().toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>
    </FieldShell>
  );
}

function FlowCard({
  href, icon, label, sublabel, color
}: {
  href: string; icon: React.ReactNode; label: string; sublabel: string; color: "amber" | "teal" | "blue";
}) {
  const router = useRouter();

  const colors = {
    amber: "bg-amber-50 border-amber-200 text-amber-600 active:bg-amber-100",
    teal: "bg-teal-50 border-teal-200 text-teal-600 active:bg-teal-100",
    blue: "bg-blue-50 border-blue-200 text-blue-600 active:bg-blue-100",
  };

  return (
    <button
      onClick={() => router.push(href)}
      className={`flex w-full items-center gap-4 rounded-2xl border ${colors[color]} p-4 text-left transition-colors`}
    >
      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-slate-900">{label}</h3>
        <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{sublabel}</p>
      </div>
      <svg className="h-5 w-5 shrink-0 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
}
