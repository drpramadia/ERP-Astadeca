"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageTransition } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/use-permissions";
import {
  adminCreateUser,
  adminToggleMembership,
  adminUpdateRole,
  adminGrantSuperUser,
  adminRevokeSuperUser,
} from "@/lib/admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Shield,
  Star,
  Plus,
  Eye,
  EyeOff,
  Users,
  ChevronDown,
  X,
  CheckCircle2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

interface RoleOption {
  id: string;
  code: string;
  name: string;
}

interface EnrichedUser {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  isActive: boolean;
  isSuperUser: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Toast notification                                                   */
/* ------------------------------------------------------------------ */

interface Toast {
  id: string;
  message: string;
  tone: "success" | "danger" | "info";
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm flex items-center gap-3 ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : toast.tone === "danger"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 rounded-full p-0.5 hover:bg-black/10 transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gradient section header                                              */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white shadow-sm">
        {icon}
      </div>
      <div>
        <h2 className="text-[15px] font-bold text-white leading-tight">{title}</h2>
        {subtitle && (
          <p className="text-xs text-white/60">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                            */
/* ------------------------------------------------------------------ */

export default function UsersPage() {
  const session = useSession();
  const router = useRouter();
  const { userId, isSuperUser, organizationId, loaded, name } = session;

  /* ── User list ── */
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  /* ── Invite form state ── */
  const [invFullName, setInvFullName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [invPassword, setInvPassword] = useState("");
  const [invRoleId, setInvRoleId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  /* ── Inline action state ── */
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState<string>("");
  const [actioningId, setActioningId] = useState<string | null>(null);

  /* ── Toast ── */
  const [toasts, setToasts] = useState<Toast[]>([]);

  function addToast(message: string, tone: Toast["tone"] = "info") {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => dismissToast(id), 4000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  /* ── Fetch roles + memberships ── */
  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    setLoadingUsers(true);

    const supabase = createClient();

    // Fetch roles — exclude SYSTEM from regular assignment options
    const { data: rolesData } = await supabase
      .from("roles")
      .select("id, code, name")
      .order("code");
    const allRoles: RoleOption[] =
      (rolesData as unknown as RoleOption[] | null) ?? [];
    setRoles(allRoles);

    // Fetch memberships with enriched profile + role
    const { data: membersData } = await supabase
      .from("organization_memberships")
      .select(
        `id, is_active, created_at,
         user:profiles!user_id(id, full_name, system_role),
         role:roles!role_id(id, code, name)`
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    const members: {
      id: string;
      is_active: boolean;
      created_at: string;
      user: { id: string; full_name: string | null; system_role: string | null } | null;
      role: { id: string; code: string; name: string } | null;
    }[] = (membersData as unknown as never[]) ?? [];

    const enriched: EnrichedUser[] = members.map((m) => ({
      membershipId: m.id,
      userId: m.user?.id ?? "",
      fullName: m.user?.full_name ?? null,
      email: "", // populated by adminListUsers parent implementation
      roleId: m.role?.id ?? "",
      roleCode: m.role?.code ?? "",
      roleName: m.role?.name ?? "",
      isActive: m.is_active,
      isSuperUser: m.user?.system_role === "SUPER_USER",
      createdAt: m.created_at,
    }));

    setUsers(enriched);
    setLoadingUsers(false);
  }, [organizationId]);

  useEffect(() => {
    if (!loaded || !organizationId) return;
    // Local async runner: the codebase convention for effect-driven loads —
    // setState happens after the awaited boundary, never synchronously here.
    async function load() {
      await fetchData();
    }
    void load();
  }, [loaded, organizationId, fetchData]);

  /* ── Create user (invitation) ── */
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !organizationId || !invRoleId) return;

    setCreating(true);
    setCreateError(null);
    setCreateSuccess(false);

    const result = await adminCreateUser({
      email: invEmail,
      fullName: invFullName,
      password: invPassword,
      roleId: invRoleId,
      organizationId,
      actorUserId: userId,
    });

    setCreating(false);

    if (result.success) {
      setCreateSuccess(true);
      setInvFullName("");
      setInvEmail("");
      setInvPassword("");
      setInvRoleId("");
      setTimeout(() => setCreateSuccess(false), 4000);
      void fetchData();
    } else {
      setCreateError(result.error);
    }
  }

  /* ── Toggle membership ── */
  async function handleToggle(user: EnrichedUser) {
    if (!userId || !organizationId) return;

    const label = user.isActive ? "menonaktifkan" : "mengaktifkan";
    if (!confirm(`Yakin ingin ${label} "${user.fullName ?? user.email}"?`)) return;

    setActioningId(user.userId);
    const result = await adminToggleMembership({
      targetUserId: user.userId,
      organizationId,
      active: !user.isActive,
      actorUserId: userId,
    });
    setActioningId(null);
    setActionTarget(null);

    if (result.success) {
      addToast(`Status "${user.fullName ?? user.email}" berhasil diperbarui.`, "success");
      void fetchData();
    } else {
      addToast(result.error ?? "Gagal mengubah status.", "danger");
    }
  }

  /* ── Update role ── */
  async function handleUpdateRole(user: EnrichedUser) {
    if (!userId || !organizationId || !pendingRoleId) return;

    const roleLabel = roles.find((r) => r.id === pendingRoleId)?.name ?? pendingRoleId;
    if (!confirm(`Ubah peran "${user.fullName ?? user.email}" menjadi ${roleLabel}?`)) return;

    setActioningId(user.userId);
    const result = await adminUpdateRole({
      targetUserId: user.userId,
      roleId: pendingRoleId,
      organizationId,
      actorUserId: userId,
    });
    setActioningId(null);
    setActionTarget(null);
    setPendingRoleId("");

    if (result.success) {
      addToast(`Peran "${user.fullName ?? user.email}" berhasil diperbarui.`, "success");
      void fetchData();
    } else {
      addToast(result.error ?? "Gagal mengubah peran.", "danger");
    }
  }

  /* ── Grant SUPER_USER ── */
  async function handleGrantSuper(user: EnrichedUser) {
    if (!userId) return;

    if (
      !confirm(`Jadikan "${user.fullName ?? user.email}" sebagai SUPER_USER?`)
    )
      return;

    setActioningId(user.userId);
    const result = await adminGrantSuperUser({
      targetUserId: user.userId,
      actorUserId: userId,
    });
    setActioningId(null);

    if (result.success) {
      addToast(
        `"${user.fullName ?? user.email}" sekarang SUPER_USER.`,
        "success"
      );
      void fetchData();
    } else {
      addToast(result.error ?? "Gagal memberikan SUPER_USER.", "danger");
    }
  }

  /* ── Revoke SUPER_USER ── */
  async function handleRevokeSuper(user: EnrichedUser) {
    if (!userId) return;

    if (
      !confirm(`Cabut SUPER_USER dari "${user.fullName ?? user.email}"?`)
    )
      return;

    setActioningId(user.userId);
    const result = await adminRevokeSuperUser({
      targetUserId: user.userId,
      actorUserId: userId,
    });
    setActioningId(null);

    if (result.success) {
      addToast(
        `SUPER_USER dicabut dari "${user.fullName ?? user.email}".`,
        "success"
      );
      void fetchData();
    } else {
      addToast(result.error ?? "Gagal mencabut SUPER_USER.", "danger");
    }
  }

  /* ── Redirect to login if not authenticated ── */
  useEffect(() => {
    if (loaded && !userId) {
      router.replace("/login");
    }
  }, [loaded, userId, router]);

  /* ── Assignable roles (exclude SYSTEM) ── */
  const assignableRoles = roles.filter((r) => r.code !== "SYSTEM");

  const activeCount = users.filter((u) => u.isActive).length;

  /* ── Loading guard ── */
  if (!loaded) {
    return (
      <AppShell>
        <PageTransition>
          <div className="flex items-center justify-center min-h-64">
            <div className="flex items-center gap-3 text-slate-400 text-sm">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Memuat…
            </div>
          </div>
        </PageTransition>
      </AppShell>
    );
  }

  /* ── Locked screen ── */
  if (!isSuperUser) {
    return (
      <AppShell>
        <PageTransition>
          <div className="flex items-center justify-center min-h-64">
            <div className="rounded-2xl border border-rose-200 bg-white p-10 text-center max-w-sm shadow-raised">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50">
                <Shield className="text-rose-500" size={32} />
              </div>
              <h1 className="text-xl font-bold text-ink mb-1">Akses Terbatas</h1>
              <p className="text-sm text-slate-500">Hanya SUPER_USER yang dapat mengakses halaman ini.</p>
            </div>
          </div>
        </PageTransition>
      </AppShell>
    );
  }

  /* ── Main content ── */
  return (
    <AppShell>
      <PageTransition>
        {/* Toast overlay */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        {/* Page header */}
        <div className="mb-7">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1
                className="text-2xl font-bold text-ink"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Pengguna &amp; Hak Akses
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Kelola pengguna organisasi &middot; logged in sebagai{" "}
                <span className="font-medium text-ink">{name}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-white/60 border border-line rounded-full px-3 py-1.5">
              <Users size={13} />
              <span>
                {users.length} pengguna &middot; {activeCount} aktif
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* ─────────────────────────────────────────── */}
          {/* SECTION 1: Tambah Pengguna Baru            */}
          {/* ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="app-surface rounded-2xl overflow-hidden"
          >
            {/* Cinematic gradient band */}
            <div className="relative -mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl bg-gradient-to-r from-[#0a7f8c] via-[#087f8a] to-[#045a64] px-6 py-5">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 30% 50%, white 0%, transparent 55%)",
                }}
              />
              <SectionHeader
                icon={<Plus size={20} />}
                title="Tambah Pengguna Baru"
                subtitle="Kirim undangan dan tetapkan peran organisasi"
              />
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Nama Lengkap"
                  placeholder="Masukkan nama lengkap"
                  value={invFullName}
                  onChange={(e) => setInvFullName(e.target.value)}
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="email@astadeca.com"
                  value={invEmail}
                  onChange={(e) => setInvEmail(e.target.value)}
                  required
                />
                <div className="relative">
                  <Input
                    label="Kata Sandi Awal"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimal 8 karakter"
                    value={invPassword}
                    onChange={(e) => setInvPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <Select
                  label="Peran"
                  placeholder="Pilih peran..."
                  options={assignableRoles.map((r) => ({
                    value: r.id,
                    label: `${r.code} \u2014 ${r.name}`,
                  }))}
                  value={invRoleId}
                  onChange={(e) => setInvRoleId(e.target.value)}
                  required
                />
              </div>

              {/* Feedback banners */}
              {createError && (
                <StatusBadge tone="danger">{createError}</StatusBadge>
              )}
              {createSuccess && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-medium">
                  <CheckCircle2 size={16} className="shrink-0" />
                  Pengguna berhasil ditambahkan!
                </div>
              )}

              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={creating}
                  icon={<Plus size={16} />}
                  disabled={!invEmail || !invRoleId}
                >
                  Kirim Undangan
                </Button>
              </div>
            </form>
          </motion.div>

          {/* ─────────────────────────────────────────── */}
          {/* SECTION 2: Daftar Pengguna                 */}
          {/* ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.07 }}
            className="app-surface rounded-2xl overflow-hidden"
          >
            {/* Cinematic gradient band — dark variant */}
            <div className="relative overflow-hidden bg-gradient-to-r from-[#0f1e26] via-[#152a35] to-[#087f8a] px-6 py-5">
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 80% 50%, white 0%, transparent 55%)",
                }}
              />
              <div className="relative flex items-center justify-between">
                <SectionHeader
                  icon={<Users size={20} />}
                  title="Daftar Pengguna"
                  subtitle={`${users.length} pengguna organisasi`}
                />
                {loadingUsers && (
                  <span className="text-xs text-white/50 animate-pulse">
                    Memuat&hellip;
                  </span>
                )}
              </div>
            </div>

            {/* Table */}
            {loadingUsers ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-3 text-slate-400 text-sm">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Memuat daftar pengguna&hellip;
                </div>
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <Users className="text-slate-400" size={24} />
                </div>
                <p className="text-sm font-medium text-slate-500">
                  Belum ada pengguna.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Tambah pengguna pertama di atas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-slate-50/60">
                      {["Nama", "Email", "Peran", "Status", "Super User", "Aksi"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    <AnimatePresence initial={false}>
                      {users.map((user, index) => (
                        <motion.tr
                          key={user.membershipId}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{
                            duration: 0.3,
                            ease: [0.22, 1, 0.36, 1],
                            delay: Math.min(index * 0.025, 0.3),
                          }}
                          className="group hover:bg-slate-50/60 transition-colors"
                        >
                          {/* Nama */}
                          <td className="px-4 py-3">
                            <div className="font-medium text-ink">
                              {user.fullName ?? "\u2014"}
                            </div>
                          </td>

                          {/* Email */}
                          <td className="px-4 py-3 text-slate-600">
                            {user.email || (
                              <span className="text-slate-400 italic text-xs">
                                tidak tersedia
                              </span>
                            )}
                          </td>

                          {/* Peran */}
                          <td className="px-4 py-3">
                            <StatusBadge tone="info">{user.roleCode}</StatusBadge>
                            {user.roleName && (
                              <div className="mt-0.5 text-xs text-slate-400">
                                {user.roleName}
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <StatusBadge tone={user.isActive ? "success" : "neutral"}>
                              {user.isActive ? "Aktif" : "Nonaktif"}
                            </StatusBadge>
                          </td>

                          {/* Super User */}
                          <td className="px-4 py-3">
                            {user.isSuperUser ? (
                              <div className="flex items-center gap-1.5 text-[#c9913c] font-semibold">
                                <Star size={14} fill="#c9913c" stroke="#c9913c" />
                                <span>Ya</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">\u2014</span>
                            )}
                          </td>

                          {/* Aksi */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Toggle — disabled for self */}
                              <Button
                                variant={user.isActive ? "danger" : "secondary"}
                                size="sm"
                                loading={
                                  actioningId === user.userId &&
                                  actionTarget === "toggle"
                                }
                                onClick={() => {
                                  setActionTarget("toggle");
                                  void handleToggle(user);
                                }}
                                disabled={
                                  user.userId === userId || actioningId !== null
                                }
                              >
                                {user.isActive ? "Nonaktifkan" : "Aktifkan"}
                              </Button>

                              {/* Ubah Peran — disabled for self */}
                              <div className="relative">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setActionTarget(
                                      actionTarget === user.userId
                                        ? null
                                        : user.userId
                                    )
                                  }
                                  className="gap-1"
                                  disabled={user.userId === userId || actioningId !== null}
                                >
                                  Ubah Peran
                                  <ChevronDown size={12} />
                                </Button>

                                {actionTarget === user.userId && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                    transition={{
                                      duration: 0.18,
                                      ease: [0.22, 1, 0.36, 1],
                                    }}
                                    className="absolute right-0 top-full mt-1.5 z-20 min-w-44 rounded-xl border border-line bg-white p-2 shadow-lifted"
                                  >
                                    <p className="mb-2 px-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                      Pilih Peran Baru
                                    </p>
                                    <div className="space-y-1">
                                      {assignableRoles.map((r) => (
                                        <button
                                          key={r.id}
                                          onClick={() => setPendingRoleId(r.id)}
                                          className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                                            pendingRoleId === r.id
                                              ? "bg-primary/10 text-primary font-semibold"
                                              : "hover:bg-slate-100 text-slate-600"
                                          }`}
                                        >
                                          {r.code} \u2014 {r.name}
                                        </button>
                                      ))}
                                    </div>
                                    {pendingRoleId && (
                                      <div className="mt-2 flex gap-1.5 pt-2 border-t border-line">
                                        <Button
                                          variant="primary"
                                          size="sm"
                                          loading={actioningId === user.userId}
                                          onClick={() => void handleUpdateRole(user)}
                                          className="flex-1"
                                        >
                                          Simpan
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setActionTarget(null);
                                            setPendingRoleId("");
                                          }}
                                        >
                                          Batal
                                        </Button>
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </div>

                              {/* Grant / Revoke SUPER_USER — disabled for self */}
                              {user.isSuperUser ? (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  loading={
                                    actioningId === user.userId &&
                                    actionTarget === "revoke"
                                  }
                                  onClick={() => {
                                    setActionTarget("revoke");
                                    void handleRevokeSuper(user);
                                  }}
                                  disabled={
                                    user.userId === userId || actioningId !== null
                                  }
                                >
                                  Cabut Super User
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  loading={
                                    actioningId === user.userId &&
                                    actionTarget === "grant"
                                  }
                                  onClick={() => {
                                    setActionTarget("grant");
                                    void handleGrantSuper(user);
                                  }}
                                  disabled={
                                    user.userId === userId || actioningId !== null
                                  }
                                  className="border-[#c9913c]/50 text-[#8a5e1e] hover:border-[#c9913c] hover:bg-amber-50"
                                >
                                  <Star
                                    size={12}
                                    className="mr-1"
                                    fill="#c9913c"
                                    stroke="#c9913c"
                                  />
                                  Jadikan Super User
                                </Button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>
      </PageTransition>
    </AppShell>
  );
}
