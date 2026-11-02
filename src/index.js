import { json, error } from "./http.js";
import { login, logout, requireAdmin } from "./auth.js";
import { listUsers, createUser, updateUser, deleteUser } from "./users.js";
import { HTML } from "./ui.js";

function securityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-frame-options", "DENY");
  headers.set("content-security-policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/health") {
    return json({ ok: true, service: "adam-panel", mode: "management-only" });
  }
  if (method === "GET" && path === "/") {
    return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  if (method === "POST" && path === "/api/login") return login(request, env);
  if (method === "POST" && path === "/api/logout") return logout(request, env);

  if (path.startsWith("/api/")) {
    if (!(await requireAdmin(request, env))) return error("ابتدا وارد پنل مدیریت شو.", 401);
    if (method === "GET" && path === "/api/me") return json({ ok: true, role: "admin" });
    if (method === "GET" && path === "/api/users") return listUsers(env);
    if (method === "POST" && path === "/api/users") return createUser(request, env);

    const match = path.match(/^\/api\/users\/(\d+)$/);
    if (match && method === "PATCH") return updateUser(request, env, match[1]);
    if (match && method === "DELETE") return deleteUser(request, env, match[1]);
    return error("مسیر API پیدا نشد.", 404);
  }

  return error("صفحه پیدا نشد.", 404);
}

export default {
  async fetch(request, env) {
    try {
      return securityHeaders(await route(request, env));
    } catch (err) {
      console.error("Adam request failed:", err?.message || "unknown error");
      return securityHeaders(error("خطای داخلی سرور. جزئیات در لاگ ثبت شد.", 500));
    }
  }
};
