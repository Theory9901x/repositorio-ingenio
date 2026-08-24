import { getCurrentUser } from "@/lib/auth";
import { ensureGcSchema } from "@/lib/gc/schema";

export const dynamic = "force-dynamic";

// Lo que cada persona tiene sobre la mesa: las solicitudes de los contratos en
// los que participa, con el estado de su propia entrega. El administrador ve
// además lo que le toca revisar.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = await ensureGcSchema();

  const [solicitudes] = await pool.query(
    `SELECT r.id, r.name, r.description, r.section, r.required,
            DATE_FORMAT(r.due_date,'%Y-%m-%d') due_date,
            DATEDIFF(r.due_date, CURDATE()) AS dias_restantes,
            c.id AS contract_id, c.title AS contract_name, c.contract_number,
            s.status AS estado, s.admin_observation AS observacion,
            DATE_FORMAT(s.created_at,'%Y-%m-%d %H:%i') AS entregado_el
       FROM contract_document_requests r
       JOIN contract_routes c ON c.id=r.contract_id
       LEFT JOIN contract_document_submissions s
              ON s.id = (SELECT s2.id FROM contract_document_submissions s2
                          WHERE s2.request_id=r.id AND s2.user_id=? ORDER BY s2.id DESC LIMIT 1)
      WHERE (r.applies_to='all' OR r.assigned_user_id=?)
        AND (EXISTS (SELECT 1 FROM contract_users cu WHERE cu.contract_id=c.id AND cu.user_id=?)
          OR EXISTS (SELECT 1 FROM contract_members cm WHERE cm.contract_id=c.id AND cm.user_id=?)
          OR c.internal_responsible_id=?)
      ORDER BY r.due_date IS NULL, r.due_date ASC, r.id DESC
      LIMIT 200`,
    [me.id, me.id, me.id, me.id, me.id]
  );

  // Sin entrega todavía, la solicitud está pendiente.
  solicitudes.forEach((s) => { s.estado = s.estado || "pendiente"; });

  const cuenta = (estado) => solicitudes.filter((s) => s.estado === estado).length;
  const resumen = {
    pendientes: cuenta("pendiente"),
    en_revision: cuenta("enviado"),
    aprobadas: cuenta("aprobado"),
    por_corregir: cuenta("rechazado") + cuenta("requiere_ajuste"),
    vencidas: solicitudes.filter((s) => s.estado === "pendiente" && s.dias_restantes !== null && s.dias_restantes < 0).length,
  };

  // Lo que esta persona tiene que revisar (solo si supervisa o administra).
  const [[porRevisar]] = await pool.query(
    `SELECT COUNT(*) AS total FROM contract_document_submissions s
       JOIN contract_routes c ON c.id=s.contract_id
      WHERE s.status='enviado' AND s.user_id<>?
        AND (? OR c.internal_responsible_id=?
             OR EXISTS (SELECT 1 FROM contract_users cu WHERE cu.contract_id=c.id AND cu.user_id=?
                          AND LOWER(cu.role_in_contract) IN ('supervisor','revisor','interventor')))`,
    [me.id, me.isAdmin ? 1 : 0, me.id, me.id]
  );
  resumen.por_revisar = porRevisar?.total || 0;

  return Response.json({ resumen, solicitudes });
}
