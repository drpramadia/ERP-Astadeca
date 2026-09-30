"use client";

/*
 * Session identity + effective permissions.
 *
 * Everything the shell needs to render (who is signed in, which role,
 * which organisation, which permission codes) comes from one hook and one
 * round of queries, so the sidebar, the route guard and any page-level
 * action gate all agree on the same snapshot.
 *
 * The permission list itself is resolved server-side by the SECURITY
 * DEFINER RPC `get_my_permissions()`. That matters: `role_permissions` must
 * stay unreadable from the browser, and a client-side join would leak the
 * whole matrix to every signed-in user. The RPC returns only the caller's
 * own codes and takes no arguments, so it cannot be pointed at someone else.
 *
 * Treat the returned set as a UI hint, never as an authorisation boundary.
 * The real gate is RLS plus `has_org_permission()` in the database.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PermissionCode =
  | "dashboard.view"
  | "admin.master_data"
  | "admin.settings"
  | "admin.users"
  | "documents.view"
  | "documents.create"
  | "documents.manage"
  | "documents.print"
  | "finance.view"
  | "finance.payment"
  | "finance.approve"
  | "inventory.view"
  | "inventory.receive"
  | "inventory.issue"
  | "inventory.transfer"
  | "inventory.adjust"
  | "inventory.opname"
  | "inventory.manage"
  | "purchase.view"
  | "purchase.create"
  | "purchase.approve"
  | "reports.view"
  | "rental.view"
  | "rental.create"
  | "rental.manage"
  | "rental.release"
  | "rental.billing"
  | "rental.approve"
  | "sales.view"
  | "sales.create"
  | "sales.approve"
  | "approval.approve";

export type SystemRole = "SUPER_USER" | "DIRECTOR" | "ADMIN" | null;

export interface SessionState {
  /** Auth user id, or null before the session resolves. */
  userId: string | null;
  /** Display name, falling back to the email local part. */
  name: string;
  email: string;
  /** Human-readable org role, e.g. "Gudang". */
  roleName: string;
  /** Machine code, e.g. "WAREHOUSE". */
  roleCode: string;
  organizationName: string;
  organizationId: string | null;
  systemRole: SystemRole;
  /** Effective permission codes for the signed-in user. */
  permissions: Set<PermissionCode>;
  isSuperUser: boolean;
  isDirector: boolean;
  /** True once the first resolution attempt finished, success or not. */
  loaded: boolean;
  /** "operational" | "rental" | "dual" | null — determined by permissions */
  systemType: "operational" | "rental" | "dual" | null;
}

const INITIAL: SessionState = {
  userId: null,
  name: "",
  email: "",
  roleName: "",
  roleCode: "",
  organizationName: "",
  organizationId: null,
  systemRole: null,
  permissions: new Set<PermissionCode>(),
  isSuperUser: false,
  isDirector: false,
  loaded: false,
  systemType: null,
};

export function useSession() {
  const [state, setState] = useState<SessionState>(INITIAL);

  const load = useCallback(async () => {
    const supabase = createClient();

    const { data: sessionData } = await supabase.auth.getSession();
    const claims = sessionData?.session?.user as
      | { sub?: string; email?: string }
      | undefined;
    const userId = claims?.sub;

    if (!userId) {
      setState({ ...INITIAL, loaded: true });
      return;
    }

    // Profile and membership are independent — fetch together.
    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, system_role")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("organization_memberships")
        .select("organization_id, role_id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const systemRole = (profile?.system_role ?? null) as SystemRole;

    // Role, organisation and permissions all key off the membership.
    const [roleResult, orgResult, permissionResult] = await Promise.all([
      membership?.role_id
        ? supabase
            .from("roles")
            .select("name, code")
            .eq("id", membership.role_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      membership?.organization_id
        ? supabase
            .from("organizations")
            .select("name")
            .eq("id", membership.organization_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc("get_my_permissions"),
    ]);

    const role = roleResult.data as { name?: string; code?: string } | null;
    const organization = orgResult.data as { name?: string } | null;
    const codes = Array.isArray(permissionResult.data)
      ? ((permissionResult.data as unknown as { permission_code: string }[]) ?? []).map(
          (r) => r.permission_code
        )
      : [];

    setState({
      userId,
      name: profile?.full_name || claims?.email || "Pengguna",
      email: claims?.email || "",
      roleName: role?.name || role?.code || "",
      roleCode: role?.code || "",
      organizationName: organization?.name || "ASTADECA",
      organizationId: membership?.organization_id ?? null,
      systemRole,
      permissions: new Set(codes as PermissionCode[]),
      isSuperUser: systemRole === "SUPER_USER",
      isDirector: systemRole === "DIRECTOR",
      loaded: true,
      systemType: (() => {
        const hasRental = codes.some(c => c.startsWith("rental."));
        const hasOper  = codes.some(c =>
          c.startsWith("inventory.") || c.startsWith("purchase.") ||
          c.startsWith("sales.")    || c.startsWith("finance.")  ||
          c === "operational.view"
        );
        if (hasRental && hasOper) return "dual";
        if (hasRental) return "rental";
        if (hasOper) return "operational";
        return null;
      })(),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) setState((current) => ({ ...current, loaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { ...state, reload: load };
}

/**
 * Single permission check against the session snapshot.
 *
 * No role short-circuit: the RPC already resolves the effective set for
 * whoever is signed in, including DIRECTOR (which holds all 32 codes) and
 * SUPER_USER (which deliberately holds only read + admin codes). A bypass
 * here would hand SUPER_USER buttons whose RPCs reject them.
 */
export function useHasPermission(code: PermissionCode) {
  const session = useSession();
  return session.permissions.has(code);
}
