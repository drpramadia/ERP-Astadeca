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
 */

import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

  // Verify actor is SUPER_USER
  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", params.actorUserId)
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

  // Create profile
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: newUserId,
      full_name: params.fullName,
    });

  if (profileError) {
    return { success: false, error: `Profil gagal dibuat: ${profileError.message}` };
  }

  // Create membership
  const { error: memberError } = await supabase
    .from("organization_memberships")
    .insert({
      user_id: newUserId,
      organization_id: params.organizationId,
      role_id: params.roleId,
      is_active: true,
    });

  if (memberError) {
    return { success: false, error: `Membership gagal dibuat: ${memberError.message}` };
  }

  // Audit log
  await supabase.from("system_audit_log").insert({
    action: "USER_CREATED",
    target_user_id: newUserId,
    organization_id: params.organizationId,
    actor_user_id: params.actorUserId,
    new_value: { email: params.email, role_id: params.roleId },
  });

  return { success: true, userId: newUserId };
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
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_membership", {
    p_user_id: params.targetUserId,
    p_org_id: params.organizationId,
    p_active: params.active,
    p_toggled_by: params.actorUserId,
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
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_user_role", {
    p_user_id: params.targetUserId,
    p_role_id: params.roleId,
    p_org_id: params.organizationId,
    p_updated_by: params.actorUserId,
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
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("grant_super_user", {
    p_target_user_id: params.targetUserId,
    p_granted_by: params.actorUserId,
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
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_super_user", {
    p_target_user_id: params.targetUserId,
    p_revoked_by: params.actorUserId,
  });

  if (error || !data?.success) {
    return { success: false, error: (data as { message?: string })?.message ?? error?.message ?? "Gagal mencabut SUPER_USER." };
  }
  return { success: true };
}
