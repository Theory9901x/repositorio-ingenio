import { contexto, auditar, ROL } from "@/lib/gc/rbac";
import { guardarArchivo, borrarArchivo, FileError } from "@/lib/gc/files";
import { avisar, usuariosDelContrato, revisoresDelContrato } from "@/lib/notificaciones";

export const dynamic = "force-dynamic";

// Solicitudes formales de documentos a los contratistas.
export async function GET(_req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;

  // El trabajador solo ve lo que se le pidió a él.
  const filtro = rol === ROL.TRABAJADOR ? " AND (r.applies_to='all' OR r.assigned_user_id=?)" : "";
  const args = rol === ROL.TRABAJADOR ? [me.id, contractId, me.id] : [me.id, contractId];

  const [rows] = await pool.query(
    `SELECT r.id, r.name, r.description, r.section, r.required, r.applies_to, r.assigned_user_id,
            r.allow_multiple, DATE_FORMAT(r.due_date,'%Y-%m-%d') due_date,
            DATE_FORMAT(r.created_at,'%Y-%m-%d') created_at,
            u.full_name AS assigned_name, cr.full_name AS created_by_name,
            DATEDIFF(r.due_date, CURDATE()) AS dias_restantes,
            (SELECT s.status FROM contract_document_submissions s WHERE s.request_id=r.id AND s.user_id=? ORDER BY s.id DESC LIMIT 1) AS mi_estado,
            (SELECT COUNT(*) FROM contract_document_submissions s WHERE s.request_id=r.id) AS entregas,
            (SELECT COUNT(*) FROM contract_document_submissions s WHERE s.request_id=r.id AND s.status='enviado') AS por_revisar
       FROM contract_document_requests r
       LEFT JOIN users u ON u.id=r.assigned_user_id
       LEFT JOIN users cr ON cr.id=r.created_by
      WHERE r.contract_id=?${filtro}
      ORDER BY r.due_date IS NULL, r.due_date ASC, r.id DESC`,
    args
  );

  // Entregas asociadas, limitadas a lo que el rol puede ver.
  const filtroEnt = rol === ROL.TRABAJADOR ? " AND s.user_id=?" : "";
  const [entregas] = await pool.query(
    `SELECT s.id, s.request_id, s.user_id, s.file_name, s.mime_type, s.size_bytes, s.status,
            s.user_comment, s.admin_observation,
            DATE_FORMAT(s.created_at,'%Y-%m-%d %H:%i') created_at,
            DATE_FORMAT(s.reviewed_at,'%Y-%m-%d %H:%i') reviewed_at,
            u.full_name AS user_name, rv.full_name AS reviewer_name
       FROM contract_document_submissions s
       JOIN users u ON u.id=s.user_id
       LEFT JOIN users rv ON rv.id=s.reviewed_by
      WHERE s.contract_id=?${filtroEnt}
      ORDER BY s.created_at DESC`,
    rol === ROL.TRABAJADOR ? [contractId, me.id] : [contractId]
  );

  return Response.json({ solicitudes: rows, entregas });
}

export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "REQUEST_CREATE");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const b = await req.json().catch(() => ({}));
  const name = (b.name || "").toString().trim();
  if (!name) return Response.json({ error: "Indica qué documento se solicita" }, { status: 400 });

  const asignado = b.assigned_user_id ? Number(b.assigned_user_id) : null;
  if (asignado) {
    const [[part]] = await pool.query("SELECT 1 AS ok FROM contract_users WHERE contract_id=? AND user_id=?", [contractId, asignado]);
    if (!part) return Response.json({ error: "El destinatario no participa en este contrato" }, { status: 400 });
  }

  const [r] = await pool.query(
    `INSERT INTO contract_document_requests (contract_id, name, description, section, required, due_date, applies_to, assigned_user_id, allow_multiple, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [contractId, name, b.description || null, b.section || "soporte", b.required === false ? 0 : 1,
     b.due_date || null, asignado ? "user" : "all", asignado, b.allow_multiple ? 1 : 0, me.id]
  );
  await auditar(pool, { me, contractId, entidad: "document_request", entidadId: r.insertId, accion: "DOCUMENT_REQUEST_CREATED", descripcion: `Documento solicitado: ${name}`, req });

  // Se avisa a quien debe entregarlo: al destinatario o a todo el contrato.
  await avisar(pool, {
    para: asignado ? [asignado] : await usuariosDelContrato(pool, contractId),
    actorId: me.id, tipo: "document_request", entidadId: r.insertId, contractId,
    titulo: `Te solicitaron un documento: ${name}`,
    mensaje: b.due_date ? `Fecha límite: ${b.due_date}` : "Sin fecha límite",
    severidad: "warning",
    link: `/gestion-contractual/contrato/${contractId}/solicitudes`,
  });
  return Response.json({ ok: true, id: r.insertId });
}

// Responder una solicitud entregando el documento.
export async function PUT(req, { params }) {
  const ctx = await contexto(params.id, "REQUEST_RESPOND");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;

  try {
    const fd = await req.formData();
    const requestId = Number(fd.get("requestId"));
    if (!requestId) return Response.json({ error: "Solicitud no indicada" }, { status: 400 });

    const [[solicitud]] = await pool.query(
      "SELECT * FROM contract_document_requests WHERE id=? AND contract_id=?",
      [requestId, contractId]
    );
    if (!solicitud) return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    if (solicitud.applies_to !== "all" && Number(solicitud.assigned_user_id) !== Number(me.id)) {
      return Response.json({ error: "Esta solicitud no está dirigida a ti" }, { status: 403 });
    }

    const guardado = await guardarArchivo(fd.get("file"), `entregas/${contractId}`, me.id);

    // Sin entregas múltiples, la nueva reemplaza a la anterior.
    if (!solicitud.allow_multiple) {
      const [previas] = await pool.query(
        "SELECT id, file_path FROM contract_document_submissions WHERE request_id=? AND user_id=?",
        [requestId, me.id]
      );
      for (const p of previas) {
        await pool.query("DELETE FROM contract_document_submissions WHERE id=?", [p.id]);
        await borrarArchivo(p.file_path);
      }
    }

    const [r] = await pool.query(
      `INSERT INTO contract_document_submissions (request_id, contract_id, user_id, file_name, file_path, mime_type, size_bytes, status, user_comment)
       VALUES (?,?,?,?,?,?,?, 'enviado', ?)`,
      [requestId, contractId, me.id, guardado.file_name, guardado.file_path, guardado.mime_type,
       guardado.size_bytes, (fd.get("comment") || "").toString() || null]
    );
    await auditar(pool, { me, contractId, entidad: "submission", entidadId: r.insertId, accion: "DOCUMENT_REQUEST_ANSWERED", descripcion: `Documento entregado: ${solicitud.name}`, req });

    // Quien revisa se entera de que hay algo esperando.
    await avisar(pool, {
      para: await revisoresDelContrato(pool, contractId), actorId: me.id,
      tipo: "submission", entidadId: r.insertId, contractId,
      titulo: `${me.full_name} entregó «${solicitud.name}»`,
      mensaje: "La entrega está pendiente de revisión",
      link: `/gestion-contractual/contrato/${contractId}/solicitudes`,
    });
    return Response.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "No se pudo entregar el documento: " + e.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const ctx = await contexto(params.id, "REQUEST_CREATE");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const reqId = Number(new URL(req.url).searchParams.get("requestId"));
  const [[solicitud]] = await pool.query("SELECT name FROM contract_document_requests WHERE id=? AND contract_id=?", [reqId, contractId]);
  if (!solicitud) return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const [entregas] = await pool.query("SELECT file_path FROM contract_document_submissions WHERE request_id=?", [reqId]);
  await pool.query("DELETE FROM contract_document_submissions WHERE request_id=?", [reqId]);
  await pool.query("DELETE FROM contract_document_requests WHERE id=?", [reqId]);
  for (const e of entregas) await borrarArchivo(e.file_path);
  await auditar(pool, { me, contractId, entidad: "document_request", entidadId: reqId, accion: "DOCUMENT_REQUEST_DELETED", descripcion: `Solicitud eliminada: ${solicitud.name}` });
  return Response.json({ ok: true });
}
