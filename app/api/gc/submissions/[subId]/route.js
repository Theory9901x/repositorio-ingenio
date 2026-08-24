import { contexto, auditar, ROL } from "@/lib/gc/rbac";
import { ensureGcSchema } from "@/lib/gc/schema";
import { getCurrentUser } from "@/lib/auth";
import { borrarArchivo } from "@/lib/gc/files";
import { avisar } from "@/lib/notificaciones";

export const dynamic = "force-dynamic";

const REVISIONES = { aprobar: "aprobado", rechazar: "rechazado", solicitar_ajuste: "requiere_ajuste" };

export async function PUT(req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = await ensureGcSchema();
  const id = Number(params.subId);

  const [[entrega]] = await pool.query(
    `SELECT s.*, r.name AS request_name FROM contract_document_submissions s
       JOIN contract_document_requests r ON r.id=s.request_id WHERE s.id=?`,
    [id]
  );
  if (!entrega) return Response.json({ error: "Entrega no encontrada" }, { status: 404 });

  const ctx = await contexto(entrega.contract_id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  if (ctx.rol === ROL.TRABAJADOR) return Response.json({ error: "No tienes permiso para revisar entregas" }, { status: 403 });
  if (Number(entrega.user_id) === Number(me.id)) {
    return Response.json({ error: "No puedes revisar tu propia entrega" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const nuevo = REVISIONES[b.accion];
  if (!nuevo) return Response.json({ error: "Acción no válida" }, { status: 400 });
  const observacion = (b.observation || "").toString().trim();
  if (nuevo !== "aprobado" && !observacion) {
    return Response.json({ error: "Indica el motivo del rechazo o del ajuste" }, { status: 400 });
  }

  await pool.query(
    "UPDATE contract_document_submissions SET status=?, admin_observation=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?",
    [nuevo, observacion || null, me.id, id]
  );
  await auditar(pool, {
    me, contractId: entrega.contract_id, entidad: "submission", entidadId: id,
    accion: nuevo === "aprobado" ? "SUBMISSION_APPROVED" : "SUBMISSION_REJECTED",
    descripcion: `Entrega «${entrega.request_name}»: ${entrega.status} → ${nuevo}`,
    antes: entrega.status, despues: nuevo, req,
  });

  // El autor de la entrega debe saber en qué quedó su documento.
  const desenlace = {
    aprobado: ["success", `Aprobaron tu entrega: ${entrega.request_name}`],
    rechazado: ["danger", `Rechazaron tu entrega: ${entrega.request_name}`],
    requiere_ajuste: ["warning", `Debes ajustar tu entrega: ${entrega.request_name}`],
  }[nuevo];
  await avisar(pool, {
    para: entrega.user_id, actorId: me.id, tipo: "submission", entidadId: id,
    contractId: entrega.contract_id, severidad: desenlace[0], titulo: desenlace[1],
    mensaje: observacion || "Sin observaciones",
    link: `/gestion-contractual/contrato/${entrega.contract_id}/solicitudes`,
  });
  return Response.json({ ok: true, status: nuevo });
}

export async function DELETE(_req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = await ensureGcSchema();
  const id = Number(params.subId);
  const [[entrega]] = await pool.query("SELECT * FROM contract_document_submissions WHERE id=?", [id]);
  if (!entrega) return Response.json({ error: "Entrega no encontrada" }, { status: 404 });

  const ctx = await contexto(entrega.contract_id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;

  // El autor puede retirar su entrega mientras no haya sido revisada.
  const propio = Number(entrega.user_id) === Number(me.id);
  if (ctx.rol !== ROL.ADMIN && !(propio && entrega.status === "enviado")) {
    return Response.json({ error: "Solo puedes retirar tu entrega antes de que sea revisada" }, { status: 403 });
  }

  await pool.query("DELETE FROM contract_document_submissions WHERE id=?", [id]);
  await borrarArchivo(entrega.file_path);
  await auditar(pool, { me, contractId: entrega.contract_id, entidad: "submission", entidadId: id, accion: "SUBMISSION_DELETED", descripcion: `Entrega retirada: ${entrega.file_name}` });
  return Response.json({ ok: true });
}
