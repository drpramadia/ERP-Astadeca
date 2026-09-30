"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/use-permissions";

type IconProps = {
  className?: string;
};

function HouseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-7H9v7H5a1 1 0 0 1-1-1v-8.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PackageIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TruckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M3 7.5h11v8H3zM14 10h3.5l2.5 2.5V15.5H14z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="17.5" cy="17.5" r="1.8" />
    </svg>
  );
}

function ShieldIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M12 3.5 18 6v5.6c0 4.2-2.5 7.7-6 9.4-3.5-1.7-6-5.2-6-9.4V6l6-2.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarehouseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M3 8.5 12 3l9 5.5v10.5a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1V8.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 13h6M9 17h6M3 9.5h18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReceiptIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M7 4.5h10a2 2 0 0 1 2 2V19l-3-2-3 2-3-2-3 2V6.5a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8.5h6M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M7 3.5h7l5 5V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3.5v5h5M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GaugeIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M4 14a8 8 0 0 1 16 0M12 12v-4M8 18.5h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GridIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="4" rx="1.5" />
      <rect x="14" y="10" width="6" height="10" rx="1.5" />
      <rect x="4" y="12" width="6" height="8" rx="1.5" />
    </svg>
  );
}

function BellIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  sender_user_id: string | null;
  profiles?: { full_name: string | null } | null;
};

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function loadNotifications(userId: string) {
      try {
        // The embed needs an explicit FK hint: notifications has two FKs to
        // profiles (recipient_user_id and sender_user_id), and a bare
        // profiles(full_name) makes PostgREST fail with PGRST201 — the error was
        // swallowed below, leaving the bell permanently empty.
        const { data: notifs, error } = await supabase
          .from("notifications")
          .select("id, type, title, message, link, is_read, created_at, sender_user_id, profiles!notifications_sender_user_id_fkey(full_name)")
          .eq("recipient_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (!cancelled && !error && notifs) {
          setNotifications(notifs as unknown as Notification[]);
          setUnreadCount(notifs.filter((n) => !n.is_read).length);
        }
      } catch {
        // silently fail
      }
    }

    async function init() {
      const { data: claimsData } = await supabase.auth.getSession();
      const userId = claimsData?.session?.user?.id;
      if (!userId || cancelled) return;

      await loadNotifications(userId);
      if (cancelled) return;

      // Keep the badge live. Realtime enforces RLS per row, so the subscription
      // must carry the column the policy filters on; a filterless subscription
      // on this table receives nothing (see 033_realtime_notifications.sql).
      channel = supabase
        .channel("notification-bell")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_user_id=eq.${userId}`,
          },
          () => { void loadNotifications(userId); }
        )
        .subscribe();
    }

    void init();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  async function markAllRead() {
    try {
      const supabase = createClient();
      await supabase.rpc("mark_notification_read", { p_all: true });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // silently fail
    }
  }

  async function markRead(id: string) {
    try {
      const supabase = createClient();
      await supabase.rpc("mark_notification_read", { p_notification_id: id });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silently fail
    }
  }

  const typeColors: Record<string, string> = {
    WARNING: "bg-amber-50 text-amber-700",
    ERROR: "bg-red-50 text-red-700",
    SUCCESS: "bg-emerald-50 text-emerald-700",
    INFO: "bg-blue-50 text-blue-700",
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-slate-600 transition-colors hover:bg-slate-50"
        aria-label="Notifikasi"
        aria-expanded={open}
      >
        <BellIcon className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white shadow">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-96 max-h-[28rem] overflow-y-auto rounded-xl border border-line bg-white shadow-[0_8px_30px_rgb(20_35_43_/_12%)]">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Notifikasi</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  Tandai semua dibaca
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-sm text-slate-400">
                <BellIcon className="mb-2 h-8 w-8 opacity-30" />
                Tidak ada notifikasi
              </div>
            ) : (
              <div className="divide-y divide-line">
                {notifications.map(notif => (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!notif.is_read) markRead(notif.id);
                      if (notif.link) window.location.href = notif.link;
                      setOpen(false);
                    }}
                    className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${notif.is_read ? "opacity-60" : ""}`}
                  >
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeColors[notif.type] || typeColors.INFO}`}>
                      {notif.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${notif.is_read ? "text-slate-500" : "text-ink"}`}>{notif.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{notif.message}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {new Date(notif.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {!notif.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/*
 * Navigation definition: each item carries the permission code required to see it.
 * The actual visibility gate is in the sidebar/mobile nav rendering below —
 * an item is hidden when canSee(item.permission) returns false.
 *
 * Permission codes are defined in DB (role_permissions table).
 * If a code doesn't exist in the DB, the item is visible to everyone.
 */
export type NavSystem = "operational" | "rental" | "all";

export const NAV_GROUPS: Array<{
  label: string;
  systems: NavSystem[];
  items: Array<{ label: string; href: string; icon: React.ComponentType<{ className?: string }>; permission: string }>;
}> = [
  {
    label: "Ringkasan",
    systems: ["all"],
    items: [
      { label: "Dashboard", href: "/dashboard", icon: HouseIcon, permission: "dashboard.view" },
    ],
  },
  {
    label: "Operasional",
    systems: ["operational", "all"],
    items: [
      { label: "Pembelian", href: "/supply-chain/purchasing", icon: ReceiptIcon, permission: "purchase.view" },
      { label: "Penerimaan", href: "/supply-chain/receiving", icon: PackageIcon, permission: "inventory.receive" },
      { label: "Quality Control", href: "/supply-chain/qc", icon: ShieldIcon, permission: "inventory.adjust" },
      { label: "Persediaan", href: "/warehouse/inventory", icon: WarehouseIcon, permission: "inventory.view" },
      { label: "Cold Storage", href: "/warehouse/cold-storages", icon: WarehouseIcon, permission: "inventory.manage" },
      { label: "Penjualan", href: "/supply-chain/sales", icon: ReceiptIcon, permission: "sales.view" },
      { label: "Pengambilan", href: "/supply-chain/picking", icon: GridIcon, permission: "inventory.view" },
      { label: "Pengiriman", href: "/supply-chain/delivery", icon: TruckIcon, permission: "inventory.issue" },
      { label: "Retur", href: "/supply-chain/returns", icon: FileIcon, permission: "inventory.view" },
    ],
  },
  {
    label: "Cold Storage",
    systems: ["rental", "all"],
    items: [
      { label: "Penyewaan", href: "/rental", icon: GaugeIcon, permission: "rental.view" },
      { label: "Inquiry", href: "/rental/inquiry", icon: FileIcon, permission: "rental.view" },
      { label: "Keranjang", href: "/rental/baskets", icon: GridIcon, permission: "rental.view" },
      { label: "Kontrak", href: "/rental/contracts", icon: FileIcon, permission: "rental.view" },
      { label: "Penerimaan Barang", href: "/rental/receiving", icon: PackageIcon, permission: "rental.view" },
      { label: "Pelepasan Barang", href: "/rental/release", icon: TruckIcon, permission: "rental.manage" },
      { label: "Penagihan", href: "/rental/billing", icon: ReceiptIcon, permission: "rental.billing" },
    ],
  },
  {
    label: "Keuangan",
    systems: ["all"],
    items: [
      { label: "Piutang", href: "/finance/receivables", icon: ReceiptIcon, permission: "finance.view" },
      { label: "Hutang", href: "/finance/payables", icon: FileIcon, permission: "finance.view" },
      { label: "Pembayaran", href: "/finance/payments", icon: ReceiptIcon, permission: "finance.payment" },
    ],
  },
  {
    label: "Manajemen",
    systems: ["all"],
    items: [
      { label: "Persetujuan", href: "/approval", icon: ShieldIcon, permission: "approval.approve" },
      { label: "Dokumen", href: "/documents", icon: FileIcon, permission: "documents.view" },
      { label: "Laporan", href: "/reports", icon: GaugeIcon, permission: "reports.view" },
      { label: "Data Master", href: "/master-data/products", icon: GridIcon, permission: "admin.master_data" },
    ],
  },
  {
    label: "Sistem",
    systems: ["all"],
    items: [
      { label: "Pengguna & Hak Akses", href: "/settings/users", icon: ShieldIcon, permission: "admin.users" },
      { label: "Pengaturan", href: "/settings", icon: GaugeIcon, permission: "admin.settings" },
    ],
  },
];

function SidebarLink({
  href,
  label,
  active,
  Icon,
  onClick,
  collapsed,
}: {
  href: string;
  label: string;
  active?: boolean;
  Icon: ComponentType<IconProps>;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all ${
        active
          ? "border-white/5 bg-sidebar-active text-white shadow-[inset_3px_0_0_#d49a45,0_7px_18px_rgb(0_0_0_/_14%)]"
          : "border-transparent text-slate-300 hover:border-white/5 hover:bg-sidebar-hover hover:text-white"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { userId, loaded, permissions, isSuperUser, isDirector, name, email, organizationName, roleName, roleCode, systemType } = useSession();

  // Field workers (WAREHOUSE, QC) see a filtered sidebar — no admin/finance
  // sections — but stay in the same AppShell layout. (See navSystems/visibleGroups below.)

  const canSee = (perm: string | undefined) => {
    if (!perm) return true;
    if (isSuperUser || isDirector) return true;
    return permissions.has(perm as Parameters<typeof permissions.has>[0]);
  };

  const navSystems: NavSystem[] = systemType === "rental"
    ? ["rental"]
    : systemType === "operational"
      ? ["operational"]
      : ["all"];

  const visibleGroups = NAV_GROUPS
    .filter((g) => g.systems.some((s) => navSystems.includes(s)))
    .map((g) => ({ ...g, items: g.items.filter((i) => canSee(i.permission)) }))
    .filter((g) => g.items.length > 0);

  // Redirect to login if the session resolves to no user.
  useEffect(() => {
    if (loaded && !userId) router.replace("/login");
  }, [loaded, userId, router]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  // Single source of truth: exact match OR controlled child-route match.
  // Never matches overlapping siblings.
  function isSidebarActive(pathname: string, href: string): boolean {
    // Exact match always wins.
    if (pathname === href) return true;
    // Only treat a trailing-slash nav item as a section header that highlights
    // on any child route. No trailing slash = specific page = exact match only.
    if (href.endsWith("/")) return pathname.startsWith(href);
    return false;
  }

  const initials = (name || email || "Pengguna").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  // Field workers always go through AppShell (sidebar layout).
  // FieldShell is reserved exclusively for /field.
  return (
      <div className="min-h-screen bg-canvas text-ink">
      <div className="flex min-h-screen">
        <aside
          className={`hidden border-r border-white/[0.07] bg-gradient-to-br from-[#1a2a32] via-sidebar to-[#0d151b] text-slate-100 lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen transition-all duration-200 ${sidebarCollapsed ? "w-[68px]" : "w-[286px]"}`}
          onMouseEnter={() => setSidebarCollapsed(false)}
          onMouseLeave={() => setSidebarCollapsed(true)}
        >
          <div className={`border-b border-white/[0.07] px-4 py-4 ${sidebarCollapsed ? "flex justify-center" : "px-5 py-5"}`}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-3">
                <Image src="/brand/astadeca.png" alt="ASTADECA" width={136} height={96} className="h-12 w-[68px] shrink-0 object-contain" priority />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">ASTADECA</p>
                  <p className="truncate text-[10px] text-slate-400">BASWARA PERSADA</p>
                </div>
              </div>
            )}

          </div>
          {!sidebarCollapsed && (
            <div className="border-b border-white/[0.07] px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Nawasena Dakara Abadi</p>
              <p className="mt-1 text-xs text-slate-300">Cold Storage & Supply Chain</p>
            </div>
          )}

          <nav className={`scroll-slim flex-1 space-y-6 overflow-y-auto ${sidebarCollapsed ? "px-2 py-5" : "px-4 py-5"}`}>
            {visibleGroups.length === 0 && !loaded && (
              <div className="px-3 py-4 text-xs text-slate-500">Memuat…</div>
            )}
            {visibleGroups.map((group) => (
              <div key={group.label}>
                {!sidebarCollapsed && <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{group.label}</p>}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <SidebarLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      Icon={item.icon}
                      active={isSidebarActive(pathname, item.href)}
                      collapsed={sidebarCollapsed}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:sticky lg:top-0 lg:h-screen">
          <header className="sticky top-0 z-20 border-b border-line/80 bg-white/88 shadow-[0_8px_24px_rgb(20_35_43_/_4%)] backdrop-blur-xl lg:relative">
            <div className="flex h-18 items-center gap-3 px-4 sm:px-6">
              <button type="button" onClick={() => setMobileNavOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-slate-600 lg:hidden" aria-label="Buka navigasi" aria-expanded={mobileNavOpen} aria-controls="mobile-navigation">
                <MenuIcon className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate text-sm text-slate-500">
                  <span>{organizationName || "ASTADECA"}</span>
                  <span className="text-slate-300">/</span>
                  <span className="font-medium text-slate-700">NAWASENA DAKARA ABADI</span>
                </div>
              </div>

              <div className="hidden items-center gap-2 sm:flex">
                <NotificationBell />

                <div className="flex items-center gap-3 rounded-xl border border-line/80 bg-gradient-to-b from-white to-[#f3f7f7] px-3 py-2 shadow-[inset_0_1px_0_white,0_2px_5px_rgb(20_35_43_/_5%)]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#31a79e] font-display text-xs font-bold text-white shadow-[0_2px_5px_rgb(8_126_139_/_25%)]">{initials || "U"}</div>
                  <div className="text-left">
                    <p className="max-w-40 truncate text-sm font-semibold text-ink">{name || email || "Pengguna"}</p>
                    <p className="text-[11px] text-slate-500">{roleName || "Akun"}</p>
                  </div>
                </div>
                <button type="button" onClick={() => void signOut()} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-slate-600 transition-colors hover:bg-slate-50" aria-label="Keluar" title="Keluar">
                  <LogoutIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-line/80 bg-white/95 p-3 shadow-[0_-10px_30px_rgb(20_35_43_/_9%)] backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-2">
          {visibleGroups.flatMap((g) => g.items).slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[10px] text-slate-500">
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
              <button type="button" onClick={() => void signOut()} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[10px] text-slate-500" aria-label="Keluar">
            <LogoutIcon className="h-4 w-4" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <nav id="mobile-navigation" aria-label="Navigasi utama" className="scroll-slim h-full w-[min(22rem,88vw)] overflow-y-auto border-r border-white/[0.07] bg-gradient-to-br from-[#1a2a32] via-sidebar to-[#0d151b] px-4 py-5 text-slate-100 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between border-b border-slate-700/60 pb-4">
              <div className="flex items-center gap-3">
                <Image src="/brand/astadeca.png" alt="ASTADECA" width={136} height={96} className="h-10 w-[58px] object-contain" />
                <div><p className="text-xs font-semibold">ASTADECA</p><p className="text-[10px] text-slate-400">Warehouse System</p></div>
              </div>
              <button type="button" onClick={() => setMobileNavOpen(false)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700" aria-label="Tutup navigasi">×</button>
            </div>
            <div className="space-y-1">
              {visibleGroups.flatMap((g) => g.items).map((item) => (
                <SidebarLink key={item.label} href={item.href} label={item.label} Icon={item.icon} active={isSidebarActive(pathname, item.href)} onClick={() => setMobileNavOpen(false)} collapsed={false} />
              ))}
              <button type="button" onClick={() => void signOut()} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-700/60 hover:text-white">
                <LogoutIcon className="h-[18px] w-[18px]" />
                Keluar
              </button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
