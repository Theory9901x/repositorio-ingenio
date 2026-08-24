import { getCurrentUser } from "@/lib/auth";
import { ensureGcSchema } from "@/lib/gc/schema";
import { filtroContratosVisibles, ROL } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

// Punto de entrada del módulo: sesión, rol, empresas visibles, contratos
// visibles e indicadores. Una sola llamada para el nivel 1 de navegación.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = await ensureGcSchema();

  const { where, args } = filtroContratosVisibles(me);

  const consultaContratos = pool.query(
    `SELECT c.id, c.title, c.code, c.status, c.company_id, c.entity_name, c.object,
            DATE_FORMAT(c.start_date,'%Y-%m-%d') start_date,
            DATE_FORMAT(c.end_date,'%Y-%m-%d') end_date,
            c.internal_responsible_id, u.full_name AS responsible_name,
            emp.name AS company_name, emp.nit AS company_nit, emp.entity_type AS company_type,
            (SELECT COUNT(*) FROM contract_users cu WHERE cu.contract_id=c.id) AS participantes,
            (SELECT COUNT(*) FROM contract_files cf WHERE cf.contract_id=c.id) AS documentos,
            (SELECT COUNT(*) FROM contract_document_submissions s WHERE s.contract_id=c.id AND s.status='enviado') AS por_revisar,
            (SELECT COUNT(*) FROM contract_document_requests r WHERE r.contract_id=c.id
               AND NOT EXISTS (SELECT 1 FROM contract_document_submissions s2 WHERE s2.request_id=r.id)) AS pendientes,
            DATEDIFF(c.end_date, CURDATE()) AS dias_para_vencer
       FROM contract_routes c
       LEFT JOIN users u ON u.id=c.internal_responsible_id
       LEFT JOIN contract_companies emp ON emp.id=c.company_id
      WHERE ${where}
      ORDER BY c.status='activo' DESC, c.end_date IS NULL, c.end_date ASC, c.title`,
    args
  );

  // Empresas: el administrador las ve todas; el resto solo aquellas donde
  // participa en algún contrato. Para el administrador ambas consultas son
  // independientes y viajan en paralelo.
  let contratos, empresas = [];
  if (me.isAdmin) {
    const [[c], [e]] = await Promise.all([
      consultaContratos,
      pool.query(
        `SELECT e.*, DATE_FORMAT(e.next_review_date,'%Y-%m-%d') next_review_date,
                u.full_name AS responsible_name,
                (SELECT COUNT(*) FROM contract_routes c WHERE c.company_id=e.id) AS contratos,
                (SELECT COUNT(*) FROM contract_routes c WHERE c.company_id=e.id AND c.status='activo') AS contratos_activos
           FROM contract_companies e
           LEFT JOIN users u ON u.id=e.internal_responsible_id
          ORDER BY e.status='activa' DESC, e.name`
      ),
    ]);
    contratos = c;
    empresas = e;
  } else {
    [contratos] = await consultaContratos;
  }
  const idsVisibles = contratos.map((c) => c.id);
  if (!me.isAdmin && idsVisibles.length) {
    const ph = idsVisibles.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT e.*, DATE_FORMAT(e.next_review_date,'%Y-%m-%d') next_review_date,
              u.full_name AS responsible_name,
              (SELECT COUNT(*) FROM contract_routes c WHERE c.company_id=e.id AND c.id IN (${ph})) AS contratos,
              (SELECT COUNT(*) FROM contract_routes c WHERE c.company_id=e.id AND c.status='activo' AND c.id IN (${ph})) AS contratos_activos
         FROM contract_companies e
         LEFT JOIN users u ON u.id=e.internal_responsible_id
        WHERE e.id IN (SELECT company_id FROM contract_routes WHERE id IN (${ph}) AND company_id IS NOT NULL)
        ORDER BY e.name`,
      [...idsVisibles, ...idsVisibles, ...idsVisibles]
    );
    empresas = rows;
  }

  // Rol global orientativo: el rol real se resuelve por contrato.
  const supervisaAlguno = contratos.some((c) => Number(c.internal_responsible_id) === Number(me.id));
  const rolGlobal = me.isAdmin ? ROL.ADMIN : supervisaAlguno ? ROL.SUPERVISOR : ROL.TRABAJADOR;

  // Indicadores acordes al rol: el trabajador ve sus obligaciones, no el global.
  let kpis;
  if (rolGlobal === ROL.TRABAJADOR) {
    const [[r]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM contract_document_requests r
            WHERE (r.applies_to='all' OR r.assigned_user_id=?)
              AND NOT EXISTS (SELECT 1 FROM contract_document_submissions s WHERE s.request_id=r.id AND s.user_id=?)) AS solicitudes_pendientes,
         (SELECT COUNT(*) FROM contract_activities a WHERE a.user_id=? AND a.status IN ('draft','needs_changes','rejected')) AS actividades_pendientes,
         (SELECT COUNT(*) FROM contract_monthly_reports m WHERE m.user_id=? AND m.status IN ('borrador','requiere_ajustes','rechazado')) AS informes_pendientes,
         (SELECT COUNT(*) FROM contract_evidences ev WHERE ev.user_id=? AND ev.status IN ('rechazada','requiere_ajuste')) AS evidencias_rechazadas`,
      [me.id, me.id, me.id, me.id, me.id]
    );
    kpis = [
      { id: "contratos", label: "Mis contratos", valor: contratos.length },
      { id: "solicitudes", label: "Documentos por entregar", valor: Number(r.solicitudes_pendientes) },
      { id: "actividades", label: "Actividades por cerrar", valor: Number(r.actividades_pendientes) },
      { id: "informes", label: "Informes por presentar", valor: Number(r.informes_pendientes) },
      { id: "evidencias", label: "Evidencias con ajustes", valor: Number(r.evidencias_rechazadas) },
    ];
  } else {
    const activos = contratos.filter((c) => c.status === "activo").length;
    const vencimientos = contratos.filter((c) => c.dias_para_vencer !== null && c.dias_para_vencer >= 0 && c.dias_para_vencer <= 30).length;
    const porRevisar = contratos.reduce((a, c) => a + Number(c.por_revisar || 0), 0);
    const pendientes = contratos.reduce((a, c) => a + Number(c.pendientes || 0), 0);
    kpis = [
      { id: "contratos", label: "Contratos activos", valor: activos },
      { id: "empresas", label: "Empresas en seguimiento", valor: empresas.length },
      { id: "entregables", label: "Entregables pendientes", valor: pendientes },
      { id: "vencimientos", label: "Próximos vencimientos", valor: vencimientos },
      { id: "revisar", label: "Solicitudes por revisar", valor: porRevisar },
    ];
  }

  return Response.json({
    me: { id: me.id, full_name: me.full_name, email: me.email, cargo: me.cargo, isAdmin: !!me.isAdmin },
    rolGlobal,
    empresas,
    contratos,
    kpis,
  });
}
