import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { ensureAdminSchema, sugerirUsuario, addAdminEvent } from "@/lib/adminSchema";

export const dynamic = "force-dynamic";

// Módulo de usuarios: la base administrativa de todas las cuentas.
// Solo un administrador puede consultarla y operarla.

function claveTemporal() {
  return `Ingenio.${crypto.randomBytes(4).toString("base64url").replace(/[-_]/g, "")}`;
}

async function contexto() {
  const me = await getCurrentUser();
  if (!me) return { error: Response.json({ error: "No autorizado" }, { status: 401 }) };
  if (!me.isAdmin) return { error: Response.json({ error: "Solo un administrador puede gestionar usuarios" }, { status: 403 }) };
  const pool = getPool();
  await ensureAdminSchema(pool);
  return { me, pool };
}

// Directorio completo con la vida de cada cuenta: contratos, aportes, entregas.
export async function GET() {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;
  const { pool } = ctx;

  const [usuarios] = await pool.query(
    `SELECT u.id, u.full_name, u.username, u.email, u.cedula, u.cargo, u.role, u.is_active,
            DATE_FORMAT(u.created_at,'%Y-%m-%d') created_at,
            (up.photo_data IS NOT NULL) AS has_photo,
            (SELECT COUNT(*) FROM contract_users cu WHERE cu.user_id=u.id) AS contratos,
            (SELECT COUNT(*) FROM contract_document_submissions s WHERE s.user_id=u.id) AS entregas,
            (SELECT COUNT(*) FROM forum_topics t WHERE t.author_id=u.id) +
            (SELECT COUNT(*) FROM forum_comments c WHERE c.author_id=u.id) AS aportes
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id=u.id
      ORDER BY u.is_active DESC, u.full_name`
  );

  // Contratos de cada usuario, en una sola consulta.
  const [participaciones] = await pool.query(
    `SELECT cu.user_id, cu.role_in_contract, c.id AS contract_id, c.title, c.status
       FROM contract_users cu JOIN contract_routes c ON c.id=cu.contract_id
      ORDER BY c.title`
  );
  const porUsuario = {};
  for (const p of participaciones) (porUsuario[p.user_id] ||= []).push(p);
  usuarios.forEach((u) => { u.participaciones = porUsuario[u.id] || []; });

  return Response.json({ usuarios });
}

// Crear una cuenta nueva con contraseña temporal.
export async function POST(req) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const b = await req.json().catch(() => ({}));

  const full_name = (b.full_name || "").toString().trim();
  const email = (b.email || "").toString().trim().toLowerCase();
  const cedula = (b.cedula || "").toString().trim();
  const username = (b.username || sugerirUsuario(full_name)).toString().trim().toLowerCase();

  if (!full_name) return Response.json({ error: "El nombre completo es obligatorio" }, { status: 400 });
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) {
    return Response.json({ error: "El usuario solo admite letras, números, puntos, guiones y guion bajo" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Correo electrónico inválido" }, { status: 400 });
  }
  const [[usado]] = await pool.query("SELECT id FROM users WHERE LOWER(username)=?", [username]);
  if (usado) return Response.json({ error: "Ese nombre de usuario ya está en uso" }, { status: 409 });
  if (email) {
    const [[repetido]] = await pool.query("SELECT id FROM users WHERE LOWER(email)=?", [email]);
    if (repetido) return Response.json({ error: "Ya existe un usuario con ese correo" }, { status: 409 });
  }

  const clave = claveTemporal();
  const rol = b.role === "admin" ? "admin" : "usuario";
  const [r] = await pool.query(
    "INSERT INTO users (full_name, cedula, email, username, password_hash, cargo, role, is_active) VALUES (?,?,?,?,?,?,?,1)",
    [full_name, cedula || "", email || null, username, await bcrypt.hash(clave, 12), (b.cargo || "").toString().trim() || "Usuario", rol]
  );
  await addAdminEvent(pool, me.id, "usuarios", "USER_CREATED", r.insertId, `Usuario creado: ${full_name} (${username})`);
  return Response.json({ ok: true, id: r.insertId, full_name, username, clave });
}

// Editar la cuenta, cambiar el rol, activar o desactivar, restablecer la clave.
export async function PATCH(req) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const b = await req.json().catch(() => ({}));
  const userId = Number(b.userId);
  if (!userId) return Response.json({ error: "Usuario no indicado" }, { status: 400 });

  const [[usuario]] = await pool.query("SELECT * FROM users WHERE id=?", [userId]);
  if (!usuario) return Response.json({ error: "El usuario no existe" }, { status: 404 });

  // Restablecer contraseña: la nueva viaja una única vez en la respuesta.
  if (b.accion === "reset") {
    const clave = claveTemporal();
    await pool.query("UPDATE users SET password_hash=? WHERE id=?", [await bcrypt.hash(clave, 12), userId]);
    await addAdminEvent(pool, me.id, "usuarios", "USER_PASSWORD_RESET", userId, `Contraseña restablecida para ${usuario.full_name}`);
    return Response.json({ ok: true, username: usuario.username, full_name: usuario.full_name, clave });
  }

  // Activar / desactivar. Nadie puede desactivarse a sí mismo.
  if (b.accion === "estado") {
    const activo = b.is_active ? 1 : 0;
    if (!activo && userId === Number(me.id)) {
      return Response.json({ error: "No puedes desactivar tu propia cuenta" }, { status: 400 });
    }
    await pool.query("UPDATE users SET is_active=? WHERE id=?", [activo, userId]);
    if (!activo) {
      // Al desactivar también sale de los contratos donde participaba.
      await pool.query("DELETE FROM contract_users WHERE user_id=?", [userId]);
      await pool.query("DELETE FROM contract_members WHERE user_id=?", [userId]);
    }
    await addAdminEvent(pool, me.id, "usuarios", activo ? "USER_ENABLED" : "USER_DISABLED", userId,
      `${usuario.full_name} ${activo ? "reactivado" : "desactivado"}`);
    return Response.json({ ok: true });
  }

  // Edición de datos de la cuenta.
  const full_name = (b.full_name ?? usuario.full_name).toString().trim();
  const cargo = (b.cargo ?? usuario.cargo ?? "").toString().trim();
  const cedula = (b.cedula ?? usuario.cedula ?? "").toString().trim();
  const email = (b.email ?? usuario.email ?? "").toString().trim().toLowerCase();
  const username = (b.username ?? usuario.username ?? "").toString().trim().toLowerCase();
  const rol = ["admin", "usuario"].includes(b.role) ? b.role : usuario.role;

  if (!full_name) return Response.json({ error: "El nombre completo es obligatorio" }, { status: 400 });
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) {
    return Response.json({ error: "Nombre de usuario inválido" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Correo electrónico inválido" }, { status: 400 });
  }
  if (rol !== "admin" && userId === Number(me.id)) {
    return Response.json({ error: "No puedes quitarte tu propio rol de administrador" }, { status: 400 });
  }
  const [[usado]] = await pool.query("SELECT id FROM users WHERE LOWER(username)=? AND id<>?", [username, userId]);
  if (usado) return Response.json({ error: "Ese nombre de usuario ya está en uso" }, { status: 409 });
  if (email) {
    const [[repetido]] = await pool.query("SELECT id FROM users WHERE LOWER(email)=? AND id<>?", [email, userId]);
    if (repetido) return Response.json({ error: "Ya existe un usuario con ese correo" }, { status: 409 });
  }

  await pool.query(
    "UPDATE users SET full_name=?, cargo=?, cedula=?, email=?, username=?, role=? WHERE id=?",
    [full_name, cargo || "Usuario", cedula, email || null, username, rol, userId]
  );
  await addAdminEvent(pool, me.id, "usuarios", "USER_UPDATED", userId, `Cuenta actualizada: ${full_name}`);
  return Response.json({ ok: true });
}
