"use server";

/*
 * Server-side Supabase Admin API client.
 *
 * Uses the service_role key from env — never expose this to the client.
 * All functions here run on the server (Next.js server actions or Route Handlers),
 * where env.SUPABASE_SERVICE_ROLE_KEY is available.
 *
 * This module is intentionally the ONLY place the service_role key is used.
 * No Supabase client created in a client component may ever hold this key.
 *
 * WHY A SECOND CLIENT EXISTS
 * `profiles` and `organization_memberships` carry SELECT/UPDATE policies only —
 * there is deliberately no INSERT policy, because the user directory is
 * admin-managed. A user-session client therefore cannot create the profile or
 * the membership row ("new row violates row-level security policy"), which is
 * exactly why creating a user used to fail after the account was made. Those
 * writes (plus the audit row) go through the service-role client below, which
 * bypasses RLS by design.
 */

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Service-role client: bypasses RLS, carries no user session.
 * Use ONLY for the admin writes that RLS blocks for regular sessions.
 */
function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Resolves the caller's user id from the server session.
 *
 * The actor id is NEVER taken from the caller-supplied argument: trusting it
 * would let any authenticated user pass a SUPER_USER's id and inherit their
 * privileges.
 */
async function resolveActorUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export interface AdminUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  disabled: boolean;
}

interface SupabaseAdminResponse {
  id: string;
  email?: string;
  role?: string;
  confirmed_at?: string;
  created_at: string;
  last_sign_in_at?: string;
  user_metadata?: Record<string, unknown>;
  aud: string;
}

/**
 * Creates an auth user and their profile in one transaction-equivalent operation.
 * Returns the new user id on success.
 *
 * Security: only callable by SUPER_USER (checked by the calling page).
 */
export async function adminCreateUser(params: {
  email: string;
  fullName: string;
  password: string;
  roleId: string;
  organizationId: string;
  actorUserId: string;
}): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  const actorUserId = await resolveActorUserId();
  if (!actorUserId || actorUserId !== params.actorUserId) {
    return { success: false, error: "Sesi tidak valid. Silakan masuk ulang." };
  }

  const supabase = await createClient();

  // Verify actor is SUPER_USER
  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", actorUserId)
    .single();

  if (profile?.system_role !== "SUPER_USER") {
    return { success: false, error: "Hanya SUPER_USER yang dapat membuat pengguna." };
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
    {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: params.email,
        password: params.password,
        email_confirm: true,
        user_metadata: { full_name: params.fullName },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "unknown error");
    // Handle duplicate email gracefully
    if (body.includes("already been registered")) {
      return { success: false, error: "Email sudah terdaftar di sistem." };
    }
    return { success: false, error: `Gagal membuat akun: ${body.slice(0, 200)}` };
  }

  const newUser: SupabaseAdminResponse = await res.json();
  const newUserId = newUser.id;

  // RLS blocks these three writes for a user session — use the service-role client.
  const admin = createAdminClient();

  // Roll back the auth user if a follow-up write fails, so a half-created
  // account never lingers without a profile or membership.
  async function rollback(reason: string) {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${newUserId}`,
      {
        method: "DELETE",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    ).catch(() => undefined);
    return { success: false as const, error: reason };
  }

  // Create profile
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: newUserId,
      full_name: params.fullName,
    });

  if (profileError) {
    return rollback(`Profil gagal dibuat: ${profileError.message}`);
  }

  // Create membership
  const { error: memberError } = await admin
    .from("organization_memberships")
    .insert({
      user_id: newUserId,
      organization_id: params.organizationId,
      role_id: params.roleId,
      is_active: true,
    });

  if (memberError) {
    return rollback(`Membership gagal dibuat: ${memberError.message}`);
  }

  // Audit log
  await admin.from("system_audit_log").insert({
    action: "USER_CREATED",
    target_user_id: newUserId,
    target_email: params.email,
    organization_id: params.organizationId,
    actor_user_id: actorUserId,
    new_value: { email: params.email, role_id: params.roleId },
  });

  return { success: true, userId: newUserId };
}

/**
 * Lists auth users (id + email) so the user directory can show real addresses.
 *
 * The email lives in auth.users, which the browser client cannot read. Only
 * SUPER_USER may call this — the admin API exposes every account in the project.
 */
export async function adminListUsers(): Promise<
  { success: true; users: { id: string; email: string }[] } | { success: false; error: string }
> {
  const actorUserId = await resolveActorUserId();
  if (!actorUserId) {
    return { success: false, error: "Sesi tidak valid. Silakan masuk ulang." };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", actorUserId)
    .single();

  if (profile?.system_role !== "SUPER_USER") {
    return { success: false, error: "Hanya SUPER_USER yang dapat melihat daftar akun." };
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "unknown error");
    return { success: false, error: `Gagal memuat daftar akun: ${body.slice(0, 200)}` };
  }

  const body = (await res.json()) as { users?: SupabaseAdminResponse[] };
  const users = (body.users ?? []).map((u) => ({ id: u.id, email: u.email ?? "" }));
  return { success: true, users };
}

/**
 * Toggle membership is_active via RPC.
 */
export async function adminToggleMembership(params: {
  targetUserId: string;
  organizationId: string;
  active: boolean;
  actorUserId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const actorUserId = await resolveActorUserId();
  if (!actorUserId || actorUserId !== params.actorUserId) {
    return { success: false, error: "Sesi tidak valid. Silakan masuk ulang." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_membership", {
    p_user_id: params.targetUserId,
    p_org_id: params.organizationId,
    p_active: params.active,
    p_toggled_by: actorUserId,
  });

  if (error || !data?.success) {
    return { success: false, error: (data as { message?: string })?.message ?? error?.message ?? "Gagal mengubah status." };
  }
  return { success: true };
}

/**
 * Update org-role via RPC.
 */
export async function adminUpdateRole(params: {
  targetUserId: string;
  roleId: string;
  organizationId: string;
  actorUserId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const actorUserId = await resolveActorUserId();
  if (!actorUserId || actorUserId !== params.actorUserId) {
    return { success: false, error: "Sesi tidak valid. Silakan masuk ulang." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_user_role", {
    p_user_id: params.targetUserId,
    p_role_id: params.roleId,
    p_org_id: params.organizationId,
    p_updated_by: actorUserId,
  });

  if (error || !data?.success) {
    return { success: false, error: (data as { message?: string })?.message ?? error?.message ?? "Gagal mengubah peran." };
  }
  return { success: true };
}

/**
 * Grant SUPER_USER system role.
 */
export async function adminGrantSuperUser(params: {
  targetUserId: string;
  actorUserId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const actorUserId = await resolveActorUserId();
  if (!actorUserId || actorUserId !== params.actorUserId) {
    return { success: false, error: "Sesi tidak valid. Silakan masuk ulang." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("grant_super_user", {
    p_target_user_id: params.targetUserId,
    p_granted_by: actorUserId,
  });

  if (error || !data?.success) {
    return { success: false, error: (data as { message?: string })?.message ?? error?.message ?? "Gagal memberikan SUPER_USER." };
  }
  return { success: true };
}

/**
 * Revoke SUPER_USER system role.
 */
export async function adminRevokeSuperUser(params: {
  targetUserId: string;
  actorUserId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const actorUserId = await resolveActorUserId();
  if (!actorUserId || actorUserId !== params.actorUserId) {
    return { success: false, error: "Sesi tidak valid. Silakan masuk ulang." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_super_user", {
    p_target_user_id: params.targetUserId,
    p_revoked_by: actorUserId,
  });

  if (error || !data?.success) {
    return { success: false, error: (data as { message?: string })?.message ?? error?.message ?? "Gagal mencabut SUPER_USER." };
  }
  return { success: true };
}
