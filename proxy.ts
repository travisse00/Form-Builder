import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Redirect, but keep any refreshed login cookies
  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user) {
    if (path.startsWith("/dashboard") || path.startsWith("/admin") || path === "/suspended") {
      return redirectTo("/login");
    }
    return response;
  }

  // Users can read their own profile (RLS), so this is allowed with their session
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_suspended")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_suspended) {
    return path === "/suspended" ? response : redirectTo("/suspended");
  }
  if (path === "/suspended" || path === "/login" || path === "/signup") {
    return redirectTo("/dashboard");
  }
  if (path.startsWith("/admin") && profile?.role !== "admin") {
    return redirectTo("/dashboard");
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/suspended", "/login", "/signup"],
};