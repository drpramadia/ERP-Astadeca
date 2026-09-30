import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  /*
   * Ambil authentication claims dengan aman.
   *
   * Jangan menggunakan:
   *
   * const {
   *   data: { claims },
   * } = ...
   *
   * karena data bisa bernilai null ketika
   * user belum memiliki session.
   */
  const { data } = await supabase.auth.getSession();

  const claims = data?.session?.user ?? null;

  const pathname = request.nextUrl.pathname;

  /*
   * Route yang boleh dibuka tanpa login.
   */
  const publicPaths = ["/login"];

  const isPublicPath = publicPaths.some(
    (path) =>
      pathname === path ||
      pathname.startsWith(`${path}/`)
  );

  /*
   * USER BELUM LOGIN
   */
  if (!claims && !isPublicPath) {
    const url = request.nextUrl.clone();

    url.pathname = "/login";
    url.searchParams.set("next", pathname);

    return NextResponse.redirect(url);
  }

  /*
   * USER SUDAH LOGIN
   * tetapi mencoba membuka halaman login.
   */
  if (claims && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  /*
   * SYSTEM GATE: redirect berdasarkan permission.
   * - rental-only user (WAREHOUSE, QC) tidak boleh ke /dashboard
   * - operational-only user tidak boleh ke /rental
   * - /system-pick hanya bisa dari role dengan kedua akses
   */
  if (claims) {
    // Only check if we have an active Supabase session
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      try {
        // Fetch user's role_id
        const { data: membership } = await supabase
          .from("organization_memberships")
          .select("role_id")
          .eq("user_id", sessionData?.session?.user?.id)
          .eq("is_active", "true")
          .maybeSingle();

        if (membership?.role_id) {
          // Fetch effective permission codes
          const { data: permRows } = await supabase
            .from("permissions")
            .select("code")
            .in("id", (
              await supabase.from("role_permissions").select("permission_id").eq("role_id", membership.role_id)
            ).data?.map((r: { permission_id: string }) => r.permission_id) ?? []);

          const perms: string[] = (permRows ?? []).map((p: { code: string }) => p.code);
          const hasRental = perms.some(c => c.startsWith("rental."));
          const hasOper  = perms.some(c =>
            c.startsWith("inventory.") || c.startsWith("purchase.") ||
            c.startsWith("sales.")    || c.startsWith("finance.")  ||
            c === "operational.view"
          );

          const url = request.nextUrl.clone();

          // Block /system-pick for non-dual-access users
          if (pathname === "/system-pick" && (!hasRental || !hasOper)) {
            url.pathname = hasRental ? "/rental" : "/dashboard";
            url.search = "";
            return NextResponse.redirect(url);
          }

          // Cold storage user tries to access operational pages
          if (hasRental && !hasOper) {
            const isOperationalPath = pathname === "/dashboard" ||
              pathname.startsWith("/supply-chain") ||
              pathname.startsWith("/warehouse") ||
              pathname.startsWith("/finance");
            if (isOperationalPath) {
              url.pathname = "/rental";
              url.search = "";
              return NextResponse.redirect(url);
            }
          }

          // Operational-only user tries to access cold storage pages
          if (!hasRental && hasOper) {
            if (pathname.startsWith("/rental") && pathname !== "/rental") {
              url.pathname = "/dashboard";
              url.search = "";
              return NextResponse.redirect(url);
            }
          }
        }
      } catch {
        // If permission check fails, allow through (don't hard-block)
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};