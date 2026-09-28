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
  const { data } = await supabase.auth.getClaims();

  const claims = data?.claims ?? null;

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

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};