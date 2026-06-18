import { getCurrentUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  return Response.json(user);
}

export async function PUT(req) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { full_name, cargo, currentPassword, newPassword } =
    await req.json().catch(() => ({}));

  const pool = getPool();

  if (newPassword) {
    if (!currentPassword) {
      return Response.json({ error: "Debes indicar tu contraseña actual" }, { status: 400 });
    }
    const [[row]] = await pool.query(
      "SELECT password_hash FROM users WHERE id=?",
      [user.id]
    );
    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) {
      return Response.json({ error: "Contraseña actual incorrecta" }, { status: 400 });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      "UPDATE users SET full_name=?, cargo=?, password_hash=? WHERE id=?",
      [full_name || user.full_name, cargo ?? user.cargo, hash, user.id]
    );
  } else {
    await pool.query(
      "UPDATE users SET full_name=?, cargo=? WHERE id=?",
      [full_name || user.full_name, cargo ?? user.cargo, user.id]
    );
  }

  return Response.json({ ok: true });
}
