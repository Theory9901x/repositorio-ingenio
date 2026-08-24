import { getCurrentUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { ensureNotificaciones } from "@/lib/notificaciones";

export const dynamic = "force-dynamic";

// Los avisos automáticos (vencimientos, actividades devueltas) se generan a lo
// sumo una vez cada cinco minutos, no en cada consulta de cada usuario.
let ultimoBarrido = 0;

// Centro de notificaciones. Cada quien ve lo suyo: las dirigidas a su usuario
// y las generales de los contratos en los que participa.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = getPool();
  await ensureNotificaciones(pool);

  // Avisos automáticos: contratos por vencer (para quien administra) y
  // actividades devueltas a su autor.
  const barrer = Date.now() - ultimoBarrido > 5 * 60 * 1000;
  if (barrer) ultimoBarrido = Date.now();
  if (barrer && me.isAdmin) {
    await pool.query(
      `INSERT INTO system_alerts (contract_id, related_type, related_id, title, message, severity)
       SELECT c.id, 'contract', c.id,
              CONCAT('Contrato próximo a vencer: ', c.title),
              CONCAT('Finaliza el ', DATE_FORMAT(c.end_date,'%Y-%m-%d')),
              IF(c.end_date < CURDATE(), 'danger', 'warning')
         FROM contract_routes c
        WHERE c.end_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          AND c.status NOT IN ('finalizado')
          AND NOT EXISTS (SELECT 1 FROM system_alerts a
                           WHERE a.related_type='contract' AND a.related_id=c.id AND a.status<>'resolved')`
    );
  }
  if (barrer) await pool.query(
    `INSERT INTO system_alerts (user_id, contract_id, related_type, related_id, title, message, severity)
     SELECT a.user_id, a.contract_id, 'activity', a.id,
            CONCAT('Actividad requiere atención: ', a.title),
            COALESCE(a.admin_comment, 'Revisa el estado de la actividad'), 'danger'
       FROM contract_activities a
      WHERE a.status IN ('rejected','needs_changes')
        AND NOT EXISTS (SELECT 1 FROM system_alerts x
                         WHERE x.related_type='activity' AND x.related_id=a.id AND x.status<>'resolved')`
  );

  const [rows] = await pool.query(
    `SELECT a.id, a.related_type, a.related_id, a.title, a.message, a.severity, a.status, a.link,
            c.title AS contract_name,
            DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i') created_at
       FROM system_alerts a
       LEFT JOIN contract_routes c ON c.id=a.contract_id
      WHERE a.status<>'resolved'
        AND (a.user_id=?
          OR (a.user_id IS NULL AND (? OR EXISTS (SELECT 1 FROM contract_members m
                                                   WHERE m.contract_id=a.contract_id AND m.user_id=?))))
      ORDER BY a.status='unread' DESC,
               FIELD(a.severity,'danger','warning','info','success'),
               a.created_at DESC
      LIMIT 80`,
    [me.id, me.isAdmin ? 1 : 0, me.id]
  );
  return Response.json(rows);
}
