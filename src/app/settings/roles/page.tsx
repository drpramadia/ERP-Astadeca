"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";

interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
}

interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permission_count?: number;
  permissions?: Permission[];
}

interface RolePermission {
  role_id: string;
  permission_id: string;
  permissions?: Permission;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  useEffect(() => {
    const cancelled: boolean = false;
    async function load() {
      try {
        const supabase = createClient();

        // Check system role first
        const { data: claimsData } = await supabase.auth.getClaims();
        const userId = claimsData?.claims?.sub;
        if (!userId) throw new Error("Silakan login untuk mengakses manajemen peran.");

        const { data: profile } = await supabase
          .from("profiles")
          .select("system_role")
          .eq("id", userId)
          .single();
        // Allow SUPER_USER or ADMIN/DIRECTOR with admin.users permission
        const profileData = profile as unknown as { system_role: string | null } | null;
        const { data: permResult } = await supabase.rpc("get_my_permissions");
        const permCodes: string[] = ((permResult as unknown as { permission_code: string }[]) ?? []).map(r => r.permission_code);
        const hasAdminUsers = permCodes.includes("admin.users");
        if (profileData?.system_role !== "SUPER_USER" && !hasAdminUsers) {
          throw new Error("Akses ditolak. Hanya Super User atau Admin dengan hak pengguna yang dapat mengakses halaman ini.");
        }

        const [rolesResult, permissionsResult, rolePermsResult] = await Promise.all([
          supabase.from("roles").select("*").order("is_system", { ascending: false }).order("name"),
          supabase.from("permissions").select("*").order("module").order("code"),
          supabase.from("role_permissions").select("role_id, permission_id, permissions(code, name, module, description)"),
        ]);

        if (rolesResult.error) throw rolesResult.error;
        if (permissionsResult.error) throw permissionsResult.error;
        if (rolePermsResult.error) throw rolePermsResult.error;

        const rolesData = (rolesResult.data || []) as unknown as Role[];
        const permsData = (permissionsResult.data || []) as unknown as Permission[];
        const rolePerms = (rolePermsResult.data || []) as unknown as RolePermission[];

        // Count permissions per role
        const permCountMap: Record<string, number> = {};
        const rolePermMap: Record<string, Permission[]> = {};
        for (const rp of rolePerms) {
          permCountMap[rp.role_id] = (permCountMap[rp.role_id] || 0) + 1;
          if (rp.permissions) {
            if (!rolePermMap[rp.role_id]) rolePermMap[rp.role_id] = [];
            rolePermMap[rp.role_id].push(rp.permissions as Permission);
          }
        }

        const enrichedRoles = rolesData.map((role) => ({
          ...role,
          permission_count: permCountMap[role.id] || 0,
          permissions: rolePermMap[role.id] || [],
        }));

        if (!cancelled) {
          setRoles(enrichedRoles);
          setAllPermissions(permsData);
          setIsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat peran.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
  }, []);

  const modules = [...new Set(allPermissions.map((p) => p.module))].sort();

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SISTEM"
          title="Manajemen Peran"
          description="Kelola peran sistem dan izin akses. Hanya Super User yang dapat mengakses halaman ini."
        />

        {error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
            <h2 className="text-lg font-semibold text-rose-800">Akses Ditolak</h2>
            <p className="mt-1 text-sm text-rose-600">{error}</p>
          </div>
        )}

        {/* Permission reference */}
        {!isLoading && allPermissions.length > 0 && (
          <details className="mb-6 rounded-xl border border-line bg-white">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Referensi Izin ({allPermissions.length} izin)
            </summary>
            <div className="border-t border-line p-5">
              {modules.map((module) => (
                <div key={module} className="mb-4 last:mb-0">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{module}</h3>
                  <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                    {allPermissions
                      .filter((p) => p.module === module)
                      .map((perm) => (
                        <div key={perm.id} className="flex items-start gap-2 text-xs">
                          <code className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{perm.code}</code>
                          <span className="text-slate-600">{perm.name}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">
            Memuat peran...
          </div>
        ) : roles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-12 text-center text-sm text-slate-500">
            Belum ada peran yang dikonfigurasi.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Table header */}
            <div className="hidden rounded-xl border border-line bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:grid" style={{ gridTemplateColumns: "2fr 1fr 2fr 100px 80px" }}>
              <div>Nama Peran</div>
              <div>Kode</div>
              <div>Deskripsi</div>
              <div className="text-center">Izin</div>
              <div className="text-center">Status</div>
            </div>

            {roles.map((role) => (
              <div key={role.id} className="rounded-xl border border-line bg-white">
                <div
                  className="grid gap-4 px-5 py-4 sm:grid-cols-[2fr_1fr_2fr_100px_80px] sm:items-center"
                >
                  <div>
                    <div className="font-medium text-ink">{role.name}</div>
                    <button
                      onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
                      className="mt-1 text-xs text-primary hover:underline"
                    >
                      {expandedRole === role.id ? "Sembunyikan izin" : "Lihat izin"}
                    </button>
                  </div>
                  <div>
                    <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{role.code}</code>
                  </div>
                  <div className="text-sm text-slate-500">{role.description || "—"}</div>
                  <div className="text-center">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {role.permission_count}
                    </span>
                  </div>
                  <div className="text-center">
                    <StatusBadge tone={role.is_system ? "info" : "neutral"}>
                      {role.is_system ? "Sistem" : "Custom"}
                    </StatusBadge>
                  </div>
                </div>

                {/* Expanded permission list */}
                {expandedRole === role.id && (
                  <div className="border-t border-line bg-slate-50 px-5 py-4">
                    {role.permissions && role.permissions.length > 0 ? (
                      <>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Izin pada peran {role.name}
                        </p>
                        <div className="space-y-2">
                          {modules.map((module) => {
                            const modulePerms = role.permissions!.filter((p) => p.module === module);
                            if (modulePerms.length === 0) return null;
                            return (
                              <div key={module}>
                                <p className="mb-1 text-xs font-bold text-slate-400">{module}</p>
                                <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                                  {modulePerms.map((perm) => (
                                    <div key={perm.id} className="flex items-start gap-2 text-xs">
                                      <code className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700 shadow-sm">
                                        {perm.code}
                                      </code>
                                      <span className="text-slate-600">{perm.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">Tidak ada izin yang ditugaskan.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
