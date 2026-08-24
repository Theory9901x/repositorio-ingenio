import { contexto, ROL } from "@/lib/gc/rbac";
import { rolEnContrato } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

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
    `SELECT u.id, u.full_name, u.cargo, u.email,
            (up.photo_data IS NOT NULL) AS has_photo
       FROM users u LEFT JOIN user_profiles up ON up.user_id=u.id
      WHERE u.is_active=1 ORDER BY u.full_name`
  );
  return Response.json(rows);
}
