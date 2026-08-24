import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPool } from "@/lib/db";
import { ensureAdminSchema, sugerirUsuario } from "@/lib/adminSchema";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { full_name, cedula, email, username, password, cargo } =
    await req.json().catch(() => ({}));

  if (!full_name || !cedula || !password || !cargo || (!email && !username)) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  }

  const pool = getPool();
  await ensureAdminSchema(pool);

  const correo = email ? email.toLowerCase().trim() : null;
  const usuario = (username || sugerirUsuario(full_name)).toLowerCase().trim();

  if (correo) {
    const [[ya]] = await pool.query("SELECT id FROM users WHERE LOWER(email)=?", [correo]);
    if (ya) return NextResponse.json({ error: "El correo ya está registrado" }, { status: 409 });
  }
  const [[usado]] = await pool.query("SELECT id FROM users WHERE LOWER(username)=?", [usuario]);
  if (usado) return NextResponse.json({ error: "El nombre de usuario ya está en uso" }, { status: 409 });

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    "INSERT INTO users (full_name, cedula, email, username, password_hash, cargo, role) VALUES (?,?,?,?,?,?,'usuario')",
    [full_name.trim(), cedula.trim(), correo, usuario, hash, cargo.trim()]
  );

  return NextResponse.json({ ok: true, username: usuario });
}
