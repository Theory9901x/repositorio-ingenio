import { contextoCm } from "@/lib/cm/schema";

export const dynamic = "force-dynamic";

// Directorio del equipo. El correo solo se muestra a quien administra.
export async function GET(req) {
  const ctx = await contextoCm();
  if (ctx.error) return ctx.error;
  const { pool, rol } = ctx;
  const q = (new URL(req.url).searchParams.get("q") || "").trim();

  const email = rol === "ADMIN" ? "u.email" : "NULL AS email";
  const filtro = q ? " AND (u.full_name LIKE ? OR u.cargo LIKE ?)" : "";
  const args = q ? [`%${q}%`, `%${q}%`] : [];

  const [personas] = await pool.query(
    `SELECT u.id, u.full_name, u.cargo, ${email}, u.is_active,
            (up.photo_data IS NOT NULL) AS has_photo, up.bio, up.phone,
            (SELECT COUNT(*) FROM forum_topics t WHERE t.author_id=u.id) AS publicaciones,
            (SELECT COUNT(*) FROM forum_comments c WHERE c.author_id=u.id) AS comentarios
       FROM users u LEFT JOIN user_profiles up ON up.user_id=u.id
      WHERE u.is_active=1${filtro}
      ORDER BY u.full_name`,
    args
  );
  return Response.json(personas);
}
