import { contexto, auditar, ROL } from "@/lib/gc/rbac";
import { ensureGcSchema } from "@/lib/gc/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALIDACIONES = {
  validar: "validada",
  solicitar_ajuste: "requiere_ajuste",
  rechazar: "rechazada",
};

export async function PUT(req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = await ensureGcSchema();
  const id = Number(params.evId);

  const [[evidencia]] = await pool.query(
    `SELECT ev.*, r.name AS requirement_name
       FROM contract_evidences ev JOIN contract_evidence_requirements r ON r.id=ev.requirement_id
      WHERE ev.id=?`,
    [id]
  );
  if (!evidencia) return Response.json({ error: "Evidencia no encontrada" }, { status: 404 });

  const ctx = await contexto(evidencia.contract_id, "EVIDENCE_VALIDATE");
  if (ctx.error) return ctx.error;

  // Nadie valida sus propias evidencias, tampoco el administrador.
  if (Number(evidencia.user_id) === Number(me.id)) {
    return Response.json({ error: "No puedes validar tus propias evidencias" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const nuevo = VALIDACIONES[b.accion];
  if (!nuevo) return Response.json({ error: "Acción no válida" }, { status: 400 });
  if (!evidencia.file_path) return Response.json({ error: "La evidencia aún no tiene archivo cargado" }, { status: 409 });

  const observacion = (b.observations || "").toString().trim();
  if (nuevo !== "validada" && !observacion) {
    return Response.json({ error: "Indica qué debe corregir el contratista" }, { status: 400 });
  }

  await pool.query(
    "UPDATE contract_evidences SET status=?, observations=?, validated_by=?, validated_at=NOW() WHERE id=?",
    [nuevo, observacion || null, me.id, id]
  );
  await auditar(pool, {
    me, contractId: evidencia.contract_id, entidad: "evidence", entidadId: id,
    accion: nuevo === "validada" ? "EVIDENCE_VALIDATED" : "EVIDENCE_REJECTED",
    descripcion: `Evidencia «${evidencia.requirement_name}»: ${evidencia.status} → ${nuevo}`,
    antes: evidencia.status, despues: nuevo, req,
  });
  return Response.json({ ok: true, status: nuevo });
}

export async function DELETE(_req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = await ensureGcSchema();
  const id = Number(params.evId);
  const [[evidencia]] = await pool.query("SELECT * FROM contract_evidences WHERE id=?", [id]);
  if (!evidencia) return Response.json({ error: "Evidencia no encontrada" }, { status: 404 });

  const ctx = await contexto(evidencia.contract_id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  if (ctx.rol !== ROL.ADMIN) return Response.json({ error: "Solo el administrador puede eliminar evidencias" }, { status: 403 });

  const { borrarArchivo } = await import("@/lib/gc/files");
  await pool.query("DELETE FROM contract_evidences WHERE id=?", [id]);
  await borrarArchivo(evidencia.file_path);
  await auditar(pool, { me, contractId: evidencia.contract_id, entidad: "evidence", entidadId: id, accion: "EVIDENCE_DELETED", descripcion: "Evidencia eliminada" });
  return Response.json({ ok: true });
}
