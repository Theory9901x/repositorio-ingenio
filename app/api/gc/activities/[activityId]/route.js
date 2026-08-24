import { contexto, auditar, ROL } from "@/lib/gc/rbac";
import { ensureGcSchema } from "@/lib/gc/schema";
import { getCurrentUser } from "@/lib/auth";
import { guardarArchivo, borrarArchivo, FileError } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

const ESTADOS_REVISION = new Set(["approved", "rejected", "needs_changes", "in_review"]);

// Localiza la actividad y resuelve el contexto de su contrato.
async function abrir(activityId, permiso) {
  const me = await getCurrentUser();
  if (!me) return { error: Response.json({ error: "No autorizado" }, { status: 401 }) };
  const pool = await ensureGcSchema();
  const id = Number(activityId);
  const [[actividad]] = await pool.query("SELECT * FROM contract_activities WHERE id=?", [id]);
  if (!actividad) return { error: Response.json({ error: "Actividad no encontrada" }, { status: 404 }) };
  const ctx = await contexto(actividad.contract_id, permiso);
  if (ctx.error) return ctx;
  // Un trabajador solo llega a sus propias actividades.
  if (ctx.rol === ROL.TRABAJADOR && Number(actividad.user_id) !== Number(ctx.me.id)) {
    return { error: Response.json({ error: "No tienes acceso a esta actividad" }, { status: 403 }) };
  }
  return { ...ctx, actividad, activityId: id };
}

export async function GET(_req, { params }) {
  const ctx = await abrir(params.activityId, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, rol, activityId } = ctx;

  const [[actividad]] = await pool.query(
    `SELECT a.*, DATE_FORMAT(a.activity_date,'%Y-%m-%d') activity_date,
            DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name AS user_name, u.cargo, rv.full_name AS reviewer_name
       FROM contract_activities a
       JOIN users u ON u.id=a.user_id
       LEFT JOIN users rv ON rv.id=a.reviewed_by
      WHERE a.id=?`,
    [activityId]
  );
  const [anexos] = await pool.query(
    `SELECT id, file_name, mime_type, size_bytes, DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') created_at
       FROM contract_activity_files WHERE activity_id=? ORDER BY created_at DESC`,
    [activityId]
  );
  const visible = rol === ROL.TRABAJADOR ? " AND c.visibility<>'admin_only'" : "";
  const [comentarios] = await pool.query(
    `SELECT c.id, c.comment, c.visibility, DATE_FORMAT(c.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name AS user_name
       FROM contract_activity_comments c JOIN users u ON u.id=c.user_id
      WHERE c.activity_id=?${visible} ORDER BY c.created_at ASC`,
    [activityId]
  );
  return Response.json({ actividad, anexos, comentarios });
}

export async function PUT(req, { params }) {
  const ctx = await abrir(params.activityId, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, actividad, activityId, contractId } = ctx;
  const b = await req.json().catch(() => ({}));

  // Revisión: exclusiva de quien puede revisar.
  if (b.accion === "revisar") {
    if (rol === ROL.TRABAJADOR) return Response.json({ error: "No puedes revisar tus propias actividades" }, { status: 403 });
    if (!ESTADOS_REVISION.has(b.status)) return Response.json({ error: "Estado de revisión inválido" }, { status: 400 });
    const comentario = (b.admin_comment || "").toString().trim();
    if ((b.status === "rejected" || b.status === "needs_changes") && !comentario) {
      return Response.json({ error: "Indica el motivo del rechazo o del ajuste solicitado" }, { status: 400 });
    }
    await pool.query(
      "UPDATE contract_activities SET status=?, admin_comment=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?",
      [b.status, comentario || null, me.id, activityId]
    );
    await auditar(pool, { me, contractId, entidad: "activity", entidadId: activityId, accion: "ACTIVITY_REVIEWED", descripcion: `Actividad «${actividad.title}» marcada como ${b.status}`, antes: actividad.status, despues: b.status, req });
    return Response.json({ ok: true });
  }

  // Edición: el autor, mientras no esté aprobada.
  const propio = Number(actividad.user_id) === Number(me.id);
  if (!propio && rol !== ROL.ADMIN) return Response.json({ error: "Solo el autor puede editar la actividad" }, { status: 403 });
  if (actividad.status === "approved" && rol !== ROL.ADMIN) {
    return Response.json({ error: "La actividad ya fue aprobada y no admite cambios" }, { status: 409 });
  }
  const title = (b.title || "").toString().trim();
  if (!title) return Response.json({ error: "El nombre de la actividad es obligatorio" }, { status: 400 });
  const estado = rol === ROL.ADMIN ? b.status || actividad.status : ["draft", "submitted"].includes(b.status) ? b.status : actividad.status;

  await pool.query(
    `UPDATE contract_activities SET title=?, description=?, category=?, activity_date=?, status=?, user_observation=?, result=? WHERE id=?`,
    [title, b.description || null, b.category || null, b.activity_date || actividad.activity_date,
     estado, b.user_observation || null, b.result || null, activityId]
  );
  await auditar(pool, { me, contractId, entidad: "activity", entidadId: activityId, accion: "ACTIVITY_UPDATED", descripcion: `Actividad actualizada: ${title}`, req });
  return Response.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const ctx = await abrir(params.activityId, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, actividad, activityId, contractId } = ctx;

  const propio = Number(actividad.user_id) === Number(me.id);
  if (rol !== ROL.ADMIN && !(propio && actividad.status === "draft")) {
    return Response.json({ error: "Solo puedes eliminar tus actividades en borrador" }, { status: 403 });
  }
  const [anexos] = await pool.query("SELECT file_path FROM contract_activity_files WHERE activity_id=?", [activityId]);
  await pool.query("DELETE FROM contract_activity_comments WHERE activity_id=?", [activityId]);
  await pool.query("DELETE FROM contract_activity_files WHERE activity_id=?", [activityId]);
  await pool.query("DELETE FROM contract_activities WHERE id=?", [activityId]);
  for (const a of anexos) await borrarArchivo(a.file_path);
  await auditar(pool, { me, contractId, entidad: "activity", entidadId: activityId, accion: "ACTIVITY_DELETED", descripcion: `Actividad eliminada: ${actividad.title}` });
  return Response.json({ ok: true });
}

// Carga de anexos y comentarios sobre la actividad.
export async function POST(req, { params }) {
  const ctx = await abrir(params.activityId, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, actividad, activityId, contractId } = ctx;
  const tipo = new URL(req.url).searchParams.get("tipo");

  if (tipo === "comentario") {
    const b = await req.json().catch(() => ({}));
    const comentario = (b.comment || "").toString().trim();
    if (!comentario) return Response.json({ error: "Escribe un comentario" }, { status: 400 });
    const visibilidad = rol === ROL.TRABAJADOR ? "visible" : b.visibility === "admin_only" ? "admin_only" : "visible";
    await pool.query(
      "INSERT INTO contract_activity_comments (activity_id, user_id, comment, visibility) VALUES (?,?,?,?)",
      [activityId, me.id, comentario, visibilidad]
    );
    return Response.json({ ok: true });
  }

  // Anexos: pertenecen a la actividad, no al contrato.
  const propio = Number(actividad.user_id) === Number(me.id);
  if (!propio && rol !== ROL.ADMIN) return Response.json({ error: "Solo el autor puede adjuntar anexos" }, { status: 403 });
  if (actividad.status === "approved" && rol !== ROL.ADMIN) {
    return Response.json({ error: "La actividad ya fue aprobada y no admite nuevos anexos" }, { status: 409 });
  }

  try {
    const fd = await req.formData();
    const archivos = fd.getAll("files").filter((f) => f && typeof f === "object");
    if (!archivos.length) return Response.json({ error: "Selecciona al menos un archivo" }, { status: 400 });
    let n = 0;
    for (const file of archivos) {
      const g = await guardarArchivo(file, `anexos/${contractId}`, me.id);
      await pool.query(
        `INSERT INTO contract_activity_files (activity_id, contract_id, user_id, file_name, file_path, mime_type, size_bytes)
         VALUES (?,?,?,?,?,?,?)`,
        [activityId, contractId, actividad.user_id, g.file_name, g.file_path, g.mime_type, g.size_bytes]
      );
      n++;
    }
    await auditar(pool, { me, contractId, entidad: "activity", entidadId: activityId, accion: "FILE_UPLOADED", descripcion: `${n} anexo(s) cargados en «${actividad.title}»`, req });
    return Response.json({ ok: true, cargados: n });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "No se pudieron cargar los anexos: " + e.message }, { status: 500 });
  }
}
