"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  full_name: string | null;
  email: string;
  system_role: string | null;
  role_code: string;
  membership_id: string;
  is_active: boolean;
  created_at: string;
}

interface RoleOption {
  id: string;
  code: string;
  name: string;
}

interface ProfileSummary {
  id: string;
  full_name: string | null;
  system_role: string | null;
}

interface MembershipRecord {
  id: string;
  is_active: boolean;
  created_at: string;
  user: ProfileSummary | null;
  role: { code: string; name: string } | null;
}

interface AuthUserSummary {
  id: string;
  email: string | null;
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [invName, setInvName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invRoleId, setInvRoleId] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getClaims();
      const claims = claimsData?.claims as { sub: string } | undefined;
      if (!claims?.sub) { router.push("/login"); return; }
      setCurrentUserId(claims.sub);

      // Check SUPER_USER
      const { data: profileData } = await supabase
        .from("profiles").select("system_role, id")
        .eq("id", claims.sub).single();
      const profile = profileData as unknown as { system_role: string | null; id: string } | null;
      setIsSuperUser(profile?.system_role === "SUPER_USER");

      // Get org membership
      const { data: memberData } = await supabase
        .from("organization_memberships").select("organization_id")
        .eq("user_id", claims.sub).eq("is_active", true).limit(1).single();
      const member = memberData as unknown as { organization_id: string } | null;
      if (member?.organization_id) setOrgId(member.organization_id);
    }
    init();
  }, [router]);

  useEffect(() => {
    if (!orgId) return;
    async function fetch() {
      setLoading(true);
      const supabase = createClient();

      // Roles
      const { data: rolesData } = await supabase
        .from("roles").select("id, code, name").order("code");
      setRoles((rolesData as unknown as RoleOption[] | null) || []);

      // Members with profiles
      const { data: membersData } = await supabase
        .from("organization_memberships")
        .select(`
          id, is_active, created_at,
          user:profiles!user_id(id, full_name, system_role),
          role:roles!role_id(code, name)
        `)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      const members = (membersData as unknown as MembershipRecord[] | null) || [];

      // Auth emails
      const userIds = members.flatMap((membership) => membership.user?.id ? [membership.user.id] : []);
      let authUsers: AuthUserSummary[] = [];
      if (userIds.length > 0) {
        const authResult = await supabase
          .from("auth.users")
          .select("id, email")
          .in("id", userIds);
        authUsers = (authResult.data as unknown as AuthUserSummary[] | null) || [];
      }
      const emailMap = new Map(authUsers.map((user) => [user.id, user.email || ""]));

      const enriched: UserRow[] = members.map((membership) => ({
        id: membership.user?.id || "",
        full_name: membership.user?.full_name || null,
        email: emailMap.get(membership.user?.id || "") || "",
        system_role: membership.user?.system_role || null,
        role_code: membership.role?.code || "",
        membership_id: membership.id,
        is_active: membership.is_active,
        created_at: membership.created_at,
      }));
      setUsers(enriched);
      setLoading(false);
    }
    fetch();
  }, [orgId]);

  async function handleInvite() {
    if (!invEmail || !invRoleId || !orgId || !currentUserId) return;
    const supabase = createClient();
    await supabase.rpc("invite_user", {
      p_organization_id: orgId,
      p_role_id: invRoleId,
      p_email: invEmail,
      p_full_name: invName,
      p_invited_by: currentUserId,
    });
    window.location.reload();
  }

  async function handleToggle(user: UserRow) {
    if (user.id === currentUserId || !isSuperUser || !orgId || !currentUserId) return;
    const supabase = createClient();
    await supabase.rpc("toggle_membership", {
      p_user_id: user.id,
      p_org_id: orgId,
      p_active: !user.is_active,
      p_toggled_by: currentUserId,
    });
    window.location.reload();
  }

  const filtered = search
    ? users.filter(u =>
        (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.role_code.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const activeCount = users.filter(u => u.is_active).length;

  if (!isSuperUser) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-8 mt-8 text-center">
          <h1 className="text-xl font-semibold">Akses Terbatas</h1>
          <p className="mt-2 text-sm text-slate-500">Halaman ini hanya untuk Super User.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Pengguna & Hak Akses"
        description="Kelola pengguna organisasi"
        actions={<Button onClick={() => setShowModal(true)}>+ Tambah Pengguna</Button>}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="text-2xl font-bold">{users.length}</div>
          <div className="text-sm text-slate-500">Total</div>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
          <div className="text-sm text-slate-500">Aktif</div>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="text-2xl font-bold text-slate-400">{users.length - activeCount}</div>
          <div className="text-sm text-slate-500">Nonaktif</div>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Cari nama, email, peran..."
          className="w-full max-w-xs rounded-lg border border-line bg-white px-3 py-2 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-2xl border border-line bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Memuat...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-500">Belum ada pengguna.</div>
            <div className="text-sm text-slate-400 mt-1">Klik tombol + Tambah Pengguna untuk mengundang.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-line">
                <th className="text-left p-3 font-semibold text-slate-600">Nama</th>
                <th className="text-left p-3 font-semibold text-slate-600">Email</th>
                <th className="text-left p-3 font-semibold text-slate-600">Peran</th>
                <th className="text-left p-3 font-semibold text-slate-600">System</th>
                <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                <th className="text-left p-3 font-semibold text-slate-600">Bergabung</th>
                <th className="text-left p-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr key={user.membership_id} className="border-b border-line hover:bg-slate-50">
                  <td className="p-3 font-medium">{user.full_name || "—"}</td>
                  <td className="p-3 text-slate-600">{user.email}</td>
                  <td className="p-3">
                    <StatusBadge tone="info">{user.role_code}</StatusBadge>
                  </td>
                  <td className="p-3">
                    {user.system_role === "SUPER_USER" && (
                      <StatusBadge tone="danger">SUPER USER</StatusBadge>
                    )}
                  </td>
                  <td className="p-3">
                    <StatusBadge tone={user.is_active ? "success" : "neutral"}>
                      {user.is_active ? "Aktif" : "Nonaktif"}
                    </StatusBadge>
                  </td>
                  <td className="p-3 text-xs text-slate-500">{formatDate(user.created_at)}</td>
                  <td className="p-3">
                    {user.id !== currentUserId && (
                      <button
                        onClick={() => handleToggle(user)}
                        className="text-xs text-primary hover:underline"
                      >
                        {user.is_active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4">
            <h2 className="text-lg font-semibold mb-4">Tambah Pengguna</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                  value={invName}
                  onChange={e => setInvName(e.target.value)}
                  placeholder="Nama lengkap"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                  value={invEmail}
                  onChange={e => setInvEmail(e.target.value)}
                  placeholder="email@contoh.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Peran</label>
                <select
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-white"
                  value={invRoleId}
                  onChange={e => setInvRoleId(e.target.value)}
                >
                  <option value="">Pilih peran</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-line">
              <Button variant="ghost" onClick={() => setShowModal(false)}>Batal</Button>
              <Button
                onClick={handleInvite}
                disabled={!invEmail || !invRoleId}
              >
                Kirim Undangan
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
