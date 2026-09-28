import { createClient } from "@/lib/supabase/server";

export async function isSuperUser(): Promise<boolean> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", claims.sub)
    .single();

  return profile?.system_role === "SUPER_USER";
}

export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", claims.sub)
    .single();

  return profile;
}

export async function requireSuperUser(): Promise<{ authorized: boolean; profile: unknown }> {
  const profile = await getCurrentProfile();
  const authorized = (profile as { system_role?: string })?.system_role === "SUPER_USER";
  return { authorized, profile };
}
