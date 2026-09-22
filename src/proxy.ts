import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/auth/session";

/**
 * Control de acceso (Next 16 "proxy", runtime Node).
 * - Si la autenticación está configurada, todas las rutas (UI y API) requieren sesión.
 * - En producción sin autenticación configurada, la app se niega a servir contenido.
 * - En desarrollo sin autenticación, se permite el acceso (solo para tu PC).
 * Además, cada Route Handler mutante vuelve a comprobar la sesión (defensa en profundidad).
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/manifest.webmanifest", "/sw.js", "/offline"];

function authConfigured() {
  const s = process.env.AUTH_SECRET;
  return Boolean(process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD_HASH && s && s.length >= 32);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  if (!authConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Autenticación no configurada: define AUTH_USERNAME, AUTH_PASSWORD_HASH y AUTH_SECRET.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|icon|apple-icon).*)"],
};
