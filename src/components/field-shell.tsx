"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function FieldShell({
  children, title, roleName,
}: {
  children: React.ReactNode;
  title: string;
  roleName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (!confirm("Logout dari aplikasi?")) return;
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }


  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-white px-4 py-3 shadow-sm border-b border-slate-200">
        <div className="flex items-center gap-3">
          {pathname !== "/field" && (
            <button
              onClick={() => router.push("/field")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
              aria-label="Kembali ke menu"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <p className="text-xs font-medium text-slate-500">{roleName}</p>
            <h1 className="text-sm font-semibold leading-tight text-slate-900">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 mr-2">
            <Image src="/brand/astadeca.png" alt="ASTADECA" width={28} height={20} className="object-contain" />
            <span className="text-xs font-bold tracking-wider text-slate-400">ASTADECA</span>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-500 active:bg-red-100 disabled:opacity-50"
            aria-label="Logout"
          >
            {loggingOut ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-red-500" />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 py-4">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-50 border-t border-slate-200 bg-white px-4 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around gap-1">
          <Link
            href="/field"
            prefetch={false}
            className={`flex flex-1 flex-col items-center gap-0.5 py-1 ${pathname === "/field" ? "text-amber-600" : "text-slate-400"}`}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-[10px] font-medium">Menu</span>
          </Link>

          <Link
            href="/supply-chain/receiving"
            prefetch={false}
            className={`flex flex-1 flex-col items-center gap-0.5 py-1 ${pathname.includes("/receiving") ? "text-amber-600" : "text-slate-400"}`}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
            <span className="text-[10px] font-medium">Terima</span>
          </Link>

          <Link
            href="/supply-chain/qc"
            prefetch={false}
            className={`flex flex-1 flex-col items-center gap-0.5 py-1 ${pathname.includes("/qc") ? "text-amber-600" : "text-slate-400"}`}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
            <span className="text-[10px] font-medium">QC</span>
          </Link>

          <Link
            href="/supply-chain/delivery"
            prefetch={false}
            className={`flex flex-1 flex-col items-center gap-0.5 py-1 ${pathname.includes("/delivery") ? "text-amber-600" : "text-slate-400"}`}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
            <span className="text-[10px] font-medium">Kirim</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
