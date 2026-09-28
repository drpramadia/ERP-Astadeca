import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function WarehouseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;

  if (!claims) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
