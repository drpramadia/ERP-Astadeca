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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message === "Invalid login credentials" ? "Email atau kata sandi tidak valid." : error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="app-surface w-full max-w-md overflow-hidden rounded-[24px]">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#172930] via-[#10232b] to-[#0c191f] px-6 py-8 text-white">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-[#59b9ad] to-primary" />
          <div aria-hidden="true" className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgb(255_255_255_/_70%)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/_70%)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex items-center justify-center">
            <Image src="/brand/astadeca.png" alt="ASTADECA" width={204} height={144} className="h-20 w-28 object-contain" priority />
          </div>
          <div className="relative mt-5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a9c5c8]">ASTADECA BASWARA PERSADA</p>
            <h1 className="font-display mt-2 text-[25px] font-semibold leading-tight text-white">NAWASENA DAKARA ABADI</h1>
            <p className="mt-2 text-sm text-slate-300">Cold Storage & Supply Chain</p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-[10px] border border-line bg-gradient-to-b from-white to-[#f4f8f8] px-4 py-3 text-sm text-ink shadow-[inset_0_1px_2px_rgb(20_35_43_/_5%)] outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                placeholder="email@perusahaan.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Kata Sandi</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-[10px] border border-line bg-gradient-to-b from-white to-[#f4f8f8] px-4 py-3 text-sm text-ink shadow-[inset_0_1px_2px_rgb(20_35_43_/_5%)] outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="button-lift w-full rounded-[10px] border border-[#086b76] bg-gradient-to-b from-[#1697a0] via-primary to-[#08717c] px-4 py-3 text-sm font-bold text-white shadow-[0_4px_0_#075762,0_9px_18px_rgb(8_126_139_/_20%),inset_0_1px_0_rgb(255_255_255_/_30%)] transition disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none active:translate-y-[3px] active:shadow-[0_1px_0_#075762,0_3px_6px_rgb(8_126_139_/_16%)]"
            >
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}