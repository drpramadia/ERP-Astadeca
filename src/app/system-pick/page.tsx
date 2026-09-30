"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const systems = [
  {
    id: "operational",
    label: "Sistem Operasional Kantor",
    tagline: "Gudang & Kantor",
    description: "Kelola stock, purchasing, sales, QC, dan operasi gudang secara terpadu.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m.75-18H5.25m-4.5 0h15A1.5 1.5 0 0019.5 3.75v13.5a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 17.25V6.75A1.5 1.5 0 014.5 5.25h15a1.5 1.5 0 011.5 1.5z" />
      </svg>
    ),
    accent: "from-[#059669] to-[#10b981]",
    bgAccent: "bg-emerald-500/10",
    borderAccent: "border-emerald-500/40",
    textAccent: "text-emerald-400",
  },
  {
    id: "rental",
    label: "Sistem Penyewaan Cold Storage",
    tagline: "Rental & Billing",
    description: "Kelola kontrak sewa, billing penagihan, dan unit cold storage.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
    accent: "from-[#0ea5e9] to-[#38bdf8]",
    bgAccent: "bg-sky-500/10",
    borderAccent: "border-sky-500/40",
    textAccent: "text-sky-400",
  },
];

export default function SystemPickPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  async function handlePick(systemId: string) {
    setLoading(systemId);
    const supabase = createClient();

    if (systemId === "rental") {
      router.push("/rental");
    } else {
      router.push("/dashboard");
    }
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a1520]">

      {/* Animated background orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-[20%] -top-[20%] h-[60%] w-[60%] animate-float-slow rounded-full bg-gradient-to-br from-[#086b76]/20 via-transparent to-transparent blur-3xl" />
        <div className="absolute -bottom-[20%] -right-[10%] h-[50%] w-[50%] animate-float-slow-reverse rounded-full bg-gradient-to-tl from-primary/15 via-transparent to-transparent blur-3xl [animation-delay:-5s]" />
        <div className="absolute left-[30%] top-[40%] h-[40%] w-[40%] animate-float-slow-rounded rounded-full bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent blur-3xl [animation-delay:-10s]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgb(255,255,255)_1px,transparent_1px), linear-gradient(90deg,rgb(255,255,255)_1px,transparent_1px)", backgroundSize: "48px 48px" }} />
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none fixed inset-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute h-1 w-1 animate-particle rounded-full bg-white/[0.15]"
            style={{
              left: `${5 + (i * 97 / 20) % 90}%`,
              top: `${10 + (i * 73 / 20) % 80}%`,
              animationDuration: `${8 + (i * 37 % 14)}s`,
              animationDelay: `${(i * 29 % 10)}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center px-4">

        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center">
          <Image src="/brand/astadeca.png" alt="ASTADECA" width={180} height={120} className="h-16 w-24 object-contain" priority />
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a9c5c8]/70">ASTADECA BASWARA PERSADA</p>
          <h1 className="font-display mt-1 text-xl font-semibold text-white">NAWASENA DAKARA ABADI</h1>
        </div>

        {/* Main card */}
        <div className="w-full overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.04] shadow-[0_8px_64px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">

          {/* Card header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#172930] via-[#10232b] to-[#0c191f] px-8 py-7">
            <div aria-hidden="true" className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(rgb(255,255,255)/70%_1px,transparent_1px),linear-gradient(90deg,rgb(255,255,255)/70%_1px,transparent_1px)", backgroundSize: "24px 24px" }} />
            <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-primary/[0.12] blur-3xl" />
            <div className="relative text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a9c5c8]">Pilih Sistem</p>
              <h2 className="mt-1 text-[22px] font-semibold text-white">Selamat Datang</h2>
              <p className="mt-1.5 text-sm text-slate-400">Anda memiliki akses ke lebih dari satu sistem. Pilih sistem yang ingin Anda akses.</p>
            </div>
          </div>

          {/* System cards */}
          <div className="px-8 py-7">
            <div className="grid grid-cols-1 gap-4">
              {systems.map((sys) => (
                <button
                  key={sys.id}
                  type="button"
                  onClick={() => handlePick(sys.id)}
                  onMouseEnter={() => setHovered(sys.id)}
                  onMouseLeave={() => setHovered(null)}
                  disabled={loading !== null}
                  className={`
                    relative flex items-start gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-300 cursor-pointer
                    ${hovered === sys.id
                      ? `border-white/20 bg-white/[0.07] shadow-[0_0_32px_rgba(255,255,255,0.05)]`
                      : `border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12]`
                    }
                    ${loading === sys.id ? "opacity-60 cursor-wait" : ""}
                  `}
                >
                  <div aria-hidden="true" className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r ${sys.accent} opacity-0 transition-opacity duration-300 ${hovered === sys.id ? "opacity-[0.06]" : ""}} />
                  <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${sys.bgAccent} border ${sys.borderAccent} transition-transform duration-300 ${hovered === sys.id ? "scale-110" : ""}}>
                    <div className={sys.textAccent}>{sys.icon}</div>
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">{sys.label}</h3>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${sys.bgAccent} ${sys.textAccent}}>{sys.tagline}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">{sys.description}</p>
                  </div>
                  <div className={`relative flex items-center self-center text-slate-500 transition-all duration-300 ${hovered === sys.id ? "translate-x-1 text-white" : ""}}>
                    {loading === sys.id ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.05] px-8 py-4 text-center">
            <p className="text-xs text-slate-500">Cold Storage & Supply Chain Management</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float-slow { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-20px) scale(1.05)} 66%{transform:translate(-15px,15px) scale(0.97)} }
        @keyframes float-slow-reverse { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-25px,20px) scale(1.04)} 66%{transform:translate(20px,-15px) scale(0.98)} }
        @keyframes particle { 0%{transform:translateY(0) translateX(0);opacity:0.15} 100%{transform:translateY(-120px) translateX(30px);opacity:0} }
        .animate-float-slow { animation: float-slow 18s ease-in-out infinite; }
        .animate-float-slow-reverse { animation: float-slow-reverse 22s ease-in-out infinite; }
        .animate-particle { animation: particle linear infinite; }
      `}</style>
    </main>
  );
}
