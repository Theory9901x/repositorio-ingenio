import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPool } from "@/lib/db";
import { signUserId, COOKIE } from "@/lib/auth";
import { ensureAdminSchema } from "@/lib/adminSchema";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Faltan campos" }, { status: 400 });
  }
  const pool = getPool();
  await ensureAdminSchema(pool);
  // Se admite tanto el correo como el nombre de usuario.
  const identificador = email.toLowerCase().trim();
  const [[user]] = await pool.query(
    "SELECT id, password_hash FROM users WHERE (LOWER(email)=? OR LOWER(username)=?) AND is_active=1 LIMIT 1",
    [identificador, identificador]
  );
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, signUserId(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  await logAudit({ actorUserId:user.id, action:"login", entityType:"session", description:"Inicio de sesión" });
  return res;
}
