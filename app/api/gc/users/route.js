import bcrypt from "bcryptjs";
import crypto from "crypto";
import { contexto, auditar, rolEnContrato, ROL } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

// Contraseña temporal legible pero no adivinable. Se devuelve una sola vez,
// al administrador que la genera; nunca se guarda ni se registra en claro.
function claveTemporal() {
  return `Ingenio.${crypto.randomBytes(4).toString("base64url").replace(/[-_]/g, "")}`;
}

// Usuarios asignables a un contrato. Solo para quien administra el contrato.
export async function GET(req) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const contractId = new URL(req.url).searchParams.get("contractId");

  if (!me.isAdmin) {
    const rol = contractId ? await rolEnContrato(pool, me, contractId) : null;
    if (rol !== ROL.SUPERVISOR) {
      return Response.json({ error: "No tienes permiso para consultar el directorio" }, { status: 403 });
    }
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.cargo, u.email, u.role, u.is_active,
            (up.photo_data IS NOT NULL) AS has_photo
       FROM users u LEFT JOIN user_profiles up ON up.user_id=u.id
      WHERE u.is_active=1 ORDER BY u.full_name`
  );
  return Response.json(rows);
}

// Crear un usuario nuevo con contraseña temporal.
export async function POST(req) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  if (!me.isAdmin) return Response.json({ error: "Solo un administrador puede crear usuarios" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const full_name = (b.full_name || "").toString().trim();
  const email = (b.email || "").toString().trim().toLowerCase();
  const cedula = (b.cedula || "").toString().trim();
  const cargo = (b.cargo || "").toString().trim();

  if (!full_name) return Response.json({ error: "El nombre completo es obligatorio" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Correo electrónico inválido" }, { status: 400 });
  if (!cedula) return Response.json({ error: "La cédula es obligatoria" }, { status: 400 });

  const [[existe]] = await pool.query("SELECT id FROM users WHERE email=?", [email]);
  if (existe) return Response.json({ error: "Ya existe un usuario con ese correo" }, { status: 409 });

  const clave = claveTemporal();
  const hash = await bcrypt.hash(clave, 12);
  const rol = b.role === "admin" ? "admin" : "usuario";

  const [r] = await pool.query(
    "INSERT INTO users (full_name, cedula, email, password_hash, cargo, role, is_active) VALUES (?,?,?,?,?,?,1)",
    [full_name, cedula, email, hash, cargo || "Usuario", rol]
  );

  await auditar(pool, {
    me, entidad: "user", entidadId: r.insertId, accion: "USER_CREATED",
    descripcion: `Usuario creado: ${full_name} (${email}) con rol ${rol}`, req,
  });

  // La contraseña viaja una única vez en esta respuesta.
  return Response.json({ ok: true, id: r.insertId, full_name, email, clave });
}

// Restablecer la contraseña de un usuario existente.
export async function PATCH(req) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  if (!me.isAdmin) return Response.json({ error: "Solo un administrador puede restablecer contraseñas" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const userId = Number(b.userId);
  if (!userId) return Response.json({ error: "Usuario no indicado" }, { status: 400 });

  const [[usuario]] = await pool.query("SELECT id, full_name, email FROM users WHERE id=?", [userId]);
  if (!usuario) return Response.json({ error: "El usuario no existe" }, { status: 404 });

  const clave = claveTemporal();
  const hash = await bcrypt.hash(clave, 12);
  await pool.query("UPDATE users SET password_hash=? WHERE id=?", [hash, userId]);

  await auditar(pool, {
    me, entidad: "user", entidadId: userId, accion: "USER_PASSWORD_RESET",
    descripcion: `Contraseña restablecida para ${usuario.full_name} (${usuario.email})`, req,
  });

  return Response.json({ ok: true, full_name: usuario.full_name, email: usuario.email, clave });
}
