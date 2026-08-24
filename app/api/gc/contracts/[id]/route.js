import { contexto, auditar, PERMISOS, ROL } from "@/lib/gc/rbac";
import { borrarArchivo } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

// Cabecera contextual del contrato: datos, rol efectivo y permisos del usuario.
export async function GET(_req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;

  const [[contrato]] = await pool.query(
    `SELECT c.*, DATE_FORMAT(c.start_date,'%Y-%m-%d') start_date, DATE_FORMAT(c.end_date,'%Y-%m-%d') end_date,
            u.full_name AS responsible_name, u.cargo AS responsible_cargo,
            emp.id AS company_id, emp.name AS company_name, emp.nit AS company_nit, emp.entity_type AS company_type,
            DATEDIFF(c.end_date, CURDATE()) AS dias_para_vencer
       FROM contract_routes c
       LEFT JOIN users u ON u.id=c.internal_responsible_id
       LEFT JOIN contract_companies emp ON emp.id=c.company_id
      WHERE c.id=?`,
    [contractId]
  );
  if (!contrato) return Response.json({ error: "Contrato no encontrado" }, { status: 404 });

  // Resumen de avance, calculado según lo que el rol puede ver.
  const propio = rol === ROL.TRABAJADOR ? " AND user_id=?" : "";
  const argsPropio = rol === ROL.TRABAJADOR ? [me.id] : [];
  const [[avance]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM contract_activities a WHERE a.contract_id=?${propio}) AS actividades,
       (SELECT COUNT(*) FROM contract_activities a WHERE a.contract_id=? AND a.status='approved'${propio}) AS actividades_aprobadas,
       (SELECT COUNT(*) FROM contract_files f WHERE f.contract_id=?) AS documentos,
       (SELECT COUNT(*) FROM contract_document_requests r WHERE r.contract_id=?) AS solicitudes,
       (SELECT COUNT(*) FROM contract_document_requests r WHERE r.contract_id=?
          AND NOT EXISTS (SELECT 1 FROM contract_document_submissions s WHERE s.request_id=r.id)) AS solicitudes_pendientes,
       (SELECT COUNT(*) FROM contract_evidences ev WHERE ev.contract_id=?${propio}) AS evidencias,
       (SELECT COUNT(*) FROM contract_evidences ev WHERE ev.contract_id=? AND ev.status='validada'${propio}) AS evidencias_validadas,
       (SELECT COUNT(*) FROM contract_users cu WHERE cu.contract_id=?) AS participantes`,
    [contractId, ...argsPropio, contractId, ...argsPropio, contractId, contractId, contractId,
     contractId, ...argsPropio, contractId, ...argsPropio, contractId]
  );

  return Response.json({
    contrato,
    rol,
    permisos: PERMISOS[rol] || [],
    avance,
    yo: { id: me.id, full_name: me.full_name, cargo: me.cargo },
  });
}

export async function PUT(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_UPDATE");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const b = await req.json().catch(() => ({}));
  const title = (b.title || "").toString().trim();
  if (!title) return Response.json({ error: "El nombre del contrato es obligatorio" }, { status: 400 });

  let companyId = b.company_id ? Number(b.company_id) : null;
  let entityName = b.entity_name || null;
  if (companyId) {
    const [[emp]] = await pool.query("SELECT name FROM contract_companies WHERE id=?", [companyId]);
    if (!emp) return Response.json({ error: "La empresa indicada no existe" }, { status: 400 });
    entityName = emp.name;
  }

  await pool.query(
    `UPDATE contract_routes SET title=?, code=?, entity_name=?, company_id=?, object=?, description=?,
            start_date=?, end_date=?, status=?, internal_responsible_id=?, value_amount=? WHERE id=?`,
    [title, b.code || null, entityName, companyId, b.object || null, b.description || null,
     b.start_date || null, b.end_date || null, b.status || "activo",
     b.internal_responsible_id || null, b.value_amount || null, contractId]
  );
  await auditar(pool, { me, contractId, entidad: "contract", entidadId: contractId, accion: "CONTRACT_UPDATED", descripcion: "Información del contrato actualizada", req });
  return Response.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_DELETE");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;

  const [[contrato]] = await pool.query("SELECT title FROM contract_routes WHERE id=?", [contractId]);
  if (!contrato) return Response.json({ error: "Contrato no encontrado" }, { status: 404 });

  try {
    // Consultas separadas: un UNION entre estas tablas falla por collations distintas.
    const grupos = await Promise.all([
      pool.query("SELECT file_path FROM contract_files WHERE contract_id=?", [contractId]),
      pool.query("SELECT file_path FROM contract_document_submissions WHERE contract_id=?", [contractId]),
      pool.query("SELECT file_path FROM contract_activity_files WHERE contract_id=?", [contractId]),
      pool.query("SELECT file_path FROM contract_evidences WHERE contract_id=?", [contractId]),
      pool.query("SELECT file_path FROM contract_monthly_reports WHERE contract_id=?", [contractId]),
    ]);
    const archivos = grupos.flatMap(([rows]) => rows);

    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      await c.query("DELETE FROM contract_activity_comments WHERE activity_id IN (SELECT id FROM contract_activities WHERE contract_id=?)", [contractId]);
      await c.query("DELETE FROM contract_activity_files WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_activities WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_activity_periods WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_monthly_reports WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_evidences WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_evidence_requirements WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM forum_topics WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_document_submissions WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_document_requests WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_files WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_events WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_users WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_members WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM entity_comments WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM system_alerts WHERE contract_id=?", [contractId]);
      await c.query("DELETE FROM contract_routes WHERE id=?", [contractId]);
      await c.commit();
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }

    for (const a of archivos) await borrarArchivo(a.file_path);
    await auditar(pool, { me, entidad: "contract", entidadId: contractId, accion: "CONTRACT_DELETED", descripcion: `Contrato eliminado: ${contrato.title}` });
    return Response.json({ ok: true, deleted: contrato.title });
  } catch (e) {
    return Response.json({ error: "No se pudo eliminar el contrato: " + e.message }, { status: 500 });
  }
}
