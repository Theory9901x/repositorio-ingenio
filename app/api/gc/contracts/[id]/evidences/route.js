import { contexto, auditar, esPropio, ROL } from "@/lib/gc/rbac";
import { guardarArchivo, borrarArchivo, FileError } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

// Checklist de evidencias de un contratista: requisitos del contrato cruzados
// con lo que esa persona ha cargado.
export async function GET(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  const url = new URL(req.url);
  const userId = rol === ROL.TRABAJADOR ? me.id : Number(url.searchParams.get("userId")) || me.id;
  if (!esPropio(rol, me, userId)) return Response.json({ error: "No puedes consultar evidencias de otro usuario" }, { status: 403 });
  const periodo = url.searchParams.get("period") || null;

  const [requisitos] = await pool.query(
    `SELECT r.id, r.name, r.category, r.description, r.required, r.frequency,
            DATE_FORMAT(r.due_date,'%Y-%m-%d') due_date, r.applies_to, r.assigned_user_id, r.sort_order
       FROM contract_evidence_requirements r
      WHERE r.contract_id=? AND (r.applies_to='todos' OR r.assigned_user_id=?)
      ORDER BY r.sort_order, r.id`,
    [contractId, userId]
  );

  const [cargadas] = await pool.query(
    `SELECT ev.id, ev.requirement_id, ev.period, ev.status, ev.file_name, ev.mime_type, ev.size_bytes,
            ev.observations, DATE_FORMAT(ev.uploaded_at,'%Y-%m-%d %H:%i') uploaded_at,
            DATE_FORMAT(ev.validated_at,'%Y-%m-%d %H:%i') validated_at,
            v.full_name AS validated_by_name
       FROM contract_evidences ev
       LEFT JOIN users v ON v.id=ev.validated_by
      WHERE ev.contract_id=? AND ev.user_id=?${periodo ? " AND (ev.period=? OR ev.period IS NULL)" : ""}
      ORDER BY ev.uploaded_at DESC`,
    periodo ? [contractId, userId, periodo] : [contractId, userId]
  );

  // Cada requisito lleva su última evidencia; sin ella queda pendiente.
  const checklist = requisitos.map((r) => {
    const propia = cargadas.find((e) => e.requirement_id === r.id) || null;
    return { ...r, evidencia: propia, status: propia ? propia.status : "pendiente" };
  });

  const cuenta = (s) => checklist.filter((c) => c.status === s).length;
  return Response.json({
    userId,
    checklist,
    resumen: {
      requeridas: checklist.filter((c) => c.required).length,
      total: checklist.length,
      cargadas: checklist.filter((c) => c.evidencia).length,
      validadas: cuenta("validada"),
      pendientes: cuenta("pendiente") + cuenta("cargada"),
      rechazadas: cuenta("rechazada") + cuenta("requiere_ajuste"),
    },
  });
}

// Cargar (o reemplazar) la evidencia de un requisito.
export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;

  try {
    const fd = await req.formData();
    const requirementId = Number(fd.get("requirementId"));
    // Un trabajador solo carga evidencias a su propio nombre.
    const userId = rol === ROL.TRABAJADOR ? me.id : Number(fd.get("userId")) || me.id;
    if (!requirementId) return Response.json({ error: "Requisito no indicado" }, { status: 400 });

    const [[req_]] = await pool.query(
      "SELECT name, frequency FROM contract_evidence_requirements WHERE id=? AND contract_id=?",
      [requirementId, contractId]
    );
    if (!req_) return Response.json({ error: "El requisito no pertenece a este contrato" }, { status: 400 });

    const [[previa]] = await pool.query(
      "SELECT * FROM contract_evidences WHERE requirement_id=? AND user_id=? AND contract_id=? ORDER BY id DESC LIMIT 1",
      [requirementId, userId, contractId]
    );
    if (previa?.status === "validada" && rol === ROL.TRABAJADOR) {
      return Response.json({ error: "Esta evidencia ya fue validada y no se puede reemplazar" }, { status: 409 });
    }

    const guardado = await guardarArchivo(fd.get("file"), `evidencias/${contractId}`, me.id);
    const periodo = (fd.get("period") || "").toString() || null;

    if (previa) {
      await borrarArchivo(previa.file_path);
      await pool.query(
        `UPDATE contract_evidences SET file_name=?, file_path=?, mime_type=?, size_bytes=?, period=?,
                status='cargada', observations=NULL, uploaded_by=?, uploaded_at=NOW(), validated_by=NULL, validated_at=NULL
          WHERE id=?`,
        [guardado.file_name, guardado.file_path, guardado.mime_type, guardado.size_bytes, periodo, me.id, previa.id]
      );
      await auditar(pool, { me, contractId, entidad: "evidence", entidadId: previa.id, accion: "FILE_REPLACED", descripcion: `Evidencia reemplazada: ${req_.name}`, antes: previa.status, despues: "cargada", req });
      return Response.json({ ok: true, id: previa.id });
    }

    const [r] = await pool.query(
      `INSERT INTO contract_evidences (requirement_id, contract_id, user_id, period, status, file_name, file_path, mime_type, size_bytes, uploaded_by)
       VALUES (?,?,?,?, 'cargada', ?,?,?,?,?)`,
      [requirementId, contractId, userId, periodo, guardado.file_name, guardado.file_path, guardado.mime_type, guardado.size_bytes, me.id]
    );
    await auditar(pool, { me, contractId, entidad: "evidence", entidadId: r.insertId, accion: "EVIDENCE_UPLOADED", descripcion: `Evidencia cargada: ${req_.name}`, req });
    return Response.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "No se pudo cargar la evidencia: " + e.message }, { status: 500 });
  }
}
