"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message === "Invalid login credentials" ? "Email atau kata sandi tidak valid." : authError.message);
      setLoading(false);
      return;
    }

    // Resolve user role to determine redirect
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) { router.push("/login"); return; }

    const { data: membership } = await supabase
      .from("organization_memberships")
      .select("role_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership?.role_id) { router.push("/login"); return; }

    const rpResult = await supabase.from("role_permissions").select("permission_id").eq("role_id", membership.role_id);
    const permIds = (rpResult.data ?? []).map((r: { permission_id: string }) => r.permission_id);

    const { data: permData } = permIds.length > 0
      ? await supabase.from("permissions").select("code").in("id", permIds)
      : { data: null };

    const perms: string[] = (permData ?? []).map((p: { code: string }) => p.code);
    const hasRental = perms.some(c => c.startsWith("rental."));
    const hasOper   = perms.some(c =>
      c.startsWith("inventory.") || c.startsWith("purchase.") ||
      c.startsWith("sales.")    || c.startsWith("finance.")  ||
      c === "operational.view"
    );

    if (hasRental && hasOper) {
      router.push("/system-pick");
    } else if (hasRental) {
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

      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-4">

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
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a9c5c8]">Sistem Informasi Manajemen</p>
              <h2 className="mt-1 text-[22px] font-semibold text-white">Masuk</h2>
              <p className="mt-1.5 text-sm text-slate-400">Masukkan kredensial akun Anda</p>
            </div>
          </div>

          {/* Credential form */}
          <div className="px-8 py-7">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Email</label>
                <input
                  type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required autoComplete="email"
                  placeholder="email@perusahaan.com"
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-slate-500 backdrop-blur-sm outline-none transition focus:border-primary/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Kata Sandi</label>
                <input
                  type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required autoComplete="current-password"
                  placeholder="Kata sandi"
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-slate-500 backdrop-blur-sm outline-none transition focus:border-primary/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {error ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 backdrop-blur-sm">{error}</div>
              ) : null}
              <button type="submit" disabled={loading}
                className="relative w-full overflow-hidden rounded-xl border border-[#086b76] bg-gradient-to-b from-[#1697a0] via-primary to-[#08717c] px-4 py-3 text-sm font-bold text-white shadow-[0_4px_0_#065f66] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-[3px] active:shadow-[0_1px_0_#065f66] disabled:active:translate-y-0">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Memproses...
                  </span>
                ) : "Masuk"}
              </button>
            </form>
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
