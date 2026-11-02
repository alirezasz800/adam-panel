import { json, error, readJson, sameOrigin } from "./http.js";

const MAX_USERS = 5;

function validName(value) {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 60;
}

function validLimit(value) {
  return value === undefined || (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100000
  );
}

function validConnections(value) {
  return value === undefined || (
    Number.isInteger(value) && value >= 1 && value <= 20
  );
}

async function audit(db, action, details = {}) {
  await db.prepare(
    "INSERT INTO audit_logs (action, details, created_at) VALUES (?, ?, ?)"
  ).bind(action, JSON.stringify(details), Date.now()).run();
}

export async function listUsers(env) {
  const result = await env.DB.prepare(
    `SELECT id, name, is_active, traffic_limit_gb, traffic_used_bytes,
            max_connections, created_at, updated_at
     FROM users ORDER BY id DESC`
  ).all();
  return json({ ok: true, users: result.results || [], max_users: MAX_USERS });
}

export async function createUser(request, env) {
  if (!sameOrigin(request)) return error("درخواست نامعتبر است.", 403);
  const body = await readJson(request);
  if (!body || !validName(body.name) || !validLimit(body.traffic_limit_gb) ||
      !validConnections(body.max_connections)) {
    return error("اطلاعات کاربر معتبر نیست.");
  }

  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  if ((count?.count || 0) >= MAX_USERS) return error("ظرفیت فعلی آدام ۵ کاربر است.", 409);

  const now = Date.now();
  const uuid = crypto.randomUUID();
  const limit = body.traffic_limit_gb ?? 0;
  const connections = body.max_connections ?? 3;

  const result = await env.DB.prepare(
    `INSERT INTO users
      (uuid, name, is_active, traffic_limit_gb, traffic_used_bytes, max_connections, created_at, updated_at)
     VALUES (?, ?, 1, ?, 0, ?, ?, ?)`
  ).bind(uuid, body.name.trim(), limit, connections, now, now).run();

  await audit(env.DB, "user_created", { user_id: result.meta?.last_row_id });
  return json({ ok: true, id: result.meta?.last_row_id }, 201);
}

export async function updateUser(request, env, id) {
  if (!sameOrigin(request)) return error("درخواست نامعتبر است.", 403);
  const body = await readJson(request);
  if (!body || !Number.isInteger(Number(id)) || Number(id) < 1) return error("شناسه یا اطلاعات نامعتبر است.");

  const current = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(Number(id)).first();
  if (!current) return error("کاربر پیدا نشد.", 404);

  const fields = [];
  const values = [];
  if (body.name !== undefined) {
    if (!validName(body.name)) return error("نام باید بین ۱ تا ۶۰ کاراکتر باشد.");
    fields.push("name = ?"); values.push(body.name.trim());
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") return error("وضعیت کاربر نامعتبر است.");
    fields.push("is_active = ?"); values.push(body.is_active ? 1 : 0);
  }
  if (body.traffic_limit_gb !== undefined) {
    if (!validLimit(body.traffic_limit_gb)) return error("محدودیت حجم نامعتبر است.");
    fields.push("traffic_limit_gb = ?"); values.push(body.traffic_limit_gb);
  }
  if (body.max_connections !== undefined) {
    if (!validConnections(body.max_connections)) return error("تعداد اتصال نامعتبر است.");
    fields.push("max_connections = ?"); values.push(body.max_connections);
  }
  if (!fields.length) return error("هیچ فیلدی برای تغییر ارسال نشده است.");

  fields.push("updated_at = ?");
  values.push(Date.now(), Number(id));
  await env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  await audit(env.DB, "user_updated", { user_id: Number(id), fields: fields.slice(0, -1) });
  return json({ ok: true });
}

export async function deleteUser(request, env, id) {
  if (!sameOrigin(request)) return error("درخواست نامعتبر است.", 403);
  if (!Number.isInteger(Number(id)) || Number(id) < 1) return error("شناسه نامعتبر است.");
  const result = await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(Number(id)).run();
  if (!result.meta?.changes) return error("کاربر پیدا نشد.", 404);
  await audit(env.DB, "user_deleted", { user_id: Number(id) });
  return json({ ok: true });
}
