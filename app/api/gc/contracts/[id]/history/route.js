import { contexto, ROL } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  const limite = Math.min(Number(new URL(req.url).searchParams.get("limit")) || 100, 300);

  // El trabajador solo ve el rastro de sus propias acciones.
  const filtro = rol === ROL.TRABAJADOR ? " AND e.actor_user_id=?" : "";
  const args = rol === ROL.TRABAJADOR ? [contractId, me.id] : [contractId];

  const [eventos] = await pool.query(
    `SELECT e.id, e.event_type, e.description, e.actor_user_id,
            DATE_FORMAT(e.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name AS actor_name, u.cargo AS actor_cargo
       FROM contract_events e
       LEFT JOIN users u ON u.id=e.actor_user_id
      WHERE e.contract_id=?${filtro}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ${limite}`,
    args
  );

  // La auditoría detallada queda reservada a quien administra el contrato.
  let auditoria = [];
  if (rol !== ROL.TRABAJADOR) {
    const [rows] = await pool.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.description, a.metadata,
              DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i') created_at, u.full_name AS actor_name
         FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
        WHERE a.contract_id=? ORDER BY a.created_at DESC, a.id DESC LIMIT ${limite}`,
      [contractId]
    );
    auditoria = rows;
  }

  return Response.json({ eventos, auditoria });
}
