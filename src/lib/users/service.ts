import { createClient } from "@/lib/supabase/server";

export interface UserListItem {
  id: string;
  full_name: string | null;
  email: string;
  system_role: string | null;
  organization_id: string;
  organization_name: string;
  role_code: string;
  role_id: string;
  membership_id: string;
  is_active: boolean;
  created_at: string;
}

export interface UserDetail extends UserListItem {
  phone: string | null;
  avatar_url: string | null;
  last_sign_in: string | null;
}

export async function getUsers(organizationId: string): Promise<UserListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select(`
      id, is_active, created_at,
      user:profiles!user_id(id, full_name, phone, avatar_url, system_role),
      role:role_id(code, name),
      organization:organization_id(name)
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((m: Record<string, unknown>) => {
    const user = m.user as Record<string, unknown> || {};
    const role = m.role as Record<string, unknown> || {};
    const org = m.organization as Record<string, unknown> || {};
    return {
      id: user.id as string,
      full_name: user.full_name as string | null,
      email: "", // email not in profiles
      system_role: user.system_role as string | null,
      organization_id: m.organization_id as string,
      organization_name: org.name as string || "ASTADECA BASWARA PERSADA",
      role_code: role.code as string || "UNKNOWN",
      role_id: m.role_id as string,
      membership_id: m.id as string,
      is_active: m.is_active as boolean,
      created_at: m.created_at as string,
    };
  });
}

export async function getInvitations(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "PENDING")
    .order("invited_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function inviteUser(params: {
  organizationId: string;
  roleId: string;
  email: string;
  fullName: string;
  invitedBy: string;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("invite_user", {
    p_organization_id: params.organizationId,
    p_role_id: params.roleId,
    p_email: params.email,
    p_full_name: params.fullName,
    p_invited_by: params.invitedBy,
  });

  if (error) throw error;
  return data;
}

export async function updateUserRole(params: {
  userId: string;
  roleId: string;
  organizationId: string;
  updatedBy: string;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("update_user_role", {
    p_user_id: params.userId,
    p_role_id: params.roleId,
    p_org_id: params.organizationId,
    p_updated_by: params.updatedBy,
  });

  if (error) throw error;
  return data;
}

export async function toggleMembership(params: {
  userId: string;
  organizationId: string;
  active: boolean;
  toggledBy: string;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("toggle_membership", {
    p_user_id: params.userId,
    p_org_id: params.organizationId,
    p_active: params.active,
    p_toggled_by: params.toggledBy,
  });

  if (error) throw error;
  return data;
}

export async function grantSuperUser(targetUserId: string, grantedBy: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("grant_super_user", {
    p_target_user_id: targetUserId,
    p_granted_by: grantedBy,
  });
  if (error) throw error;
  return data;
}

export async function revokeSuperUser(targetUserId: string, revokedBy: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_super_user", {
    p_target_user_id: targetUserId,
    p_revoked_by: revokedBy,
  });
  if (error) throw error;
  return data;
}

export async function getRoles() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").select("*").order("code");
  if (error) throw error;
  return data || [];
}

export async function getSystemAudit(organizationId: string, limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("system_audit_log")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
