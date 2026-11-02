import { json, error, readJson, sameOrigin, getCookie } from "./http.js";

const SESSION_COOKIE = "__Host-adam_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function clientIpHash(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  return sha256(`adam-login:${ip}`);
}

async function checkLoginLimit(request, db, now) {
  const ipHash = await clientIpHash(request);
  const row = await db.prepare(
    "SELECT attempts, window_started_at, blocked_until FROM auth_attempts WHERE ip_hash = ?"
  ).bind(ipHash).first();

  if (row && row.blocked_until > now) return { blocked: true, ipHash };

  if (!row || now - row.window_started_at > LOGIN_WINDOW_MS) {
    await db.prepare(
      `INSERT INTO auth_attempts (ip_hash, attempts, window_started_at, blocked_until)
       VALUES (?, 0, ?, 0)
       ON CONFLICT(ip_hash) DO UPDATE SET attempts = 0, window_started_at = excluded.window_started_at, blocked_until = 0`
    ).bind(ipHash, now).run();
  }
  return { blocked: false, ipHash };
}

async function recordFailedLogin(db, ipHash, now) {
  const row = await db.prepare(
    "SELECT attempts, window_started_at FROM auth_attempts WHERE ip_hash = ?"
  ).bind(ipHash).first();

  const inWindow = row && now - row.window_started_at <= LOGIN_WINDOW_MS;
  const attempts = inWindow ? row.attempts + 1 : 1;
  const windowStart = inWindow ? row.window_started_at : now;
  const blockedUntil = attempts >= MAX_ATTEMPTS ? now + LOGIN_WINDOW_MS : 0;

  await db.prepare(
    `INSERT INTO auth_attempts (ip_hash, attempts, window_started_at, blocked_until)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ip_hash) DO UPDATE SET attempts = excluded.attempts,
       window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until`
  ).bind(ipHash, attempts, windowStart, blockedUntil).run();
}

export async function login(request, env) {
  if (!sameOrigin(request)) return error("درخواست نامعتبر است.", 403);
  if (!env.DB) return error("اتصال دیتابیس تنظیم نشده است.", 500);
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16) {
    return error("رمز مدیریت تنظیم نشده یا کمتر از ۱۶ کاراکتر است.", 503);
  }

  const now = Date.now();
  const limit = await checkLoginLimit(request, env.DB, now);
  if (limit.blocked) return error("تلاش‌های ورود بیش از حد مجاز است؛ ۱۵ دقیقه بعد دوباره امتحان کن.", 429);

  const body = await readJson(request);
  const supplied = typeof body?.password === "string" ? body.password : "";
  const valid = constantTimeEqual(await sha256(supplied), await sha256(env.ADMIN_PASSWORD));

  if (!valid) {
    await recordFailedLogin(env.DB, limit.ipHash, now);
    return error("رمز مدیریت اشتباه است.", 401);
  }

  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
  await env.DB.prepare("DELETE FROM auth_attempts WHERE ip_hash = ?").bind(limit.ipHash).run();

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  await env.DB.prepare(
    "INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)"
  ).bind(tokenHash, now, expiresAt).run();

  return json({ ok: true }, 200, {
    "set-cookie": sessionCookie(token, SESSION_TTL_SECONDS)
  });
}

export async function requireAdmin(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || !env.DB) return false;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const session = await env.DB.prepare(
    "SELECT id FROM sessions WHERE id = ? AND expires_at > ?"
  ).bind(tokenHash, now).first();
  return Boolean(session);
}

export async function logout(request, env) {
  if (!sameOrigin(request)) return error("درخواست نامعتبر است.", 403);
  const token = getCookie(request, SESSION_COOKIE);
  if (token && env.DB) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind(await sha256(token)).run();
  }
  return json({ ok: true }, 200, {
    "set-cookie": sessionCookie("", 0)
  });
}
