import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { full_name, cedula, email, password, cargo } =
    await req.json().catch(() => ({}));

  if (!full_name || !cedula || !email || !password || !cargo) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  }

  const pool = getPool();
  const [[existing]] = await pool.query(
    "SELECT id FROM users WHERE email=?",
    [email.toLowerCase().trim()]
  );
  if (existing) {
    return NextResponse.json(
      { error: "El correo ya está registrado" },
      { status: 409 }
    );
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    "INSERT INTO users (full_name, cedula, email, password_hash, cargo, role) VALUES (?,?,?,?,?,'usuario')",
    [full_name.trim(), cedula.trim(), email.toLowerCase().trim(), hash, cargo.trim()]
  );

  return NextResponse.json({ ok: true });
}
