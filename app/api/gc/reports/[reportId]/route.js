import { contexto, auditar, ROL } from "@/lib/gc/rbac";
import { ensureGcSchema } from "@/lib/gc/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Transiciones válidas del ciclo de vida del informe mensual.
const TRANSICIONES = {
  presentar: { desde: ["borrador", "requiere_ajustes", "rechazado"], hacia: "en_revision", quien: "autor" },
  aprobar: { desde: ["en_revision"], hacia: "aprobado", quien: "revisor" },
  rechazar: { desde: ["en_revision"], hacia: "rechazado", quien: "revisor" },
  solicitar_ajustes: { desde: ["en_revision"], hacia: "requiere_ajustes", quien: "revisor" },
  reabrir: { desde: ["aprobado", "rechazado"], hacia: "borrador", quien: "admin" },
};

export async function PUT(req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = await ensureGcSchema();
  const id = Number(params.reportId);

  const [[informe]] = await pool.query("SELECT * FROM contract_monthly_reports WHERE id=?", [id]);
  if (!informe) return Response.json({ error: "Informe no encontrado" }, { status: 404 });

  const ctx = await contexto(informe.contract_id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { rol } = ctx;

  const b = await req.json().catch(() => ({}));
  const paso = TRANSICIONES[b.accion];
  if (!paso) return Response.json({ error: "Acción no válida" }, { status: 400 });

  if (!paso.desde.includes(informe.status)) {
    return Response.json(
      { error: `Un informe en estado "${informe.status}" no admite esta acción` },
      { status: 409 }
    );
  }

  const propio = Number(informe.user_id) === Number(me.id);
  if (paso.quien === "autor" && !propio && rol !== ROL.ADMIN) {
    return Response.json({ error: "Solo el autor presenta su informe" }, { status: 403 });
  }
  if (paso.quien === "revisor") {
    if (rol === ROL.TRABAJADOR) return Response.json({ error: "No tienes permiso para revisar informes" }, { status: 403 });
    // Nadie aprueba su propio informe, ni siquiera el administrador.
    if (propio) return Response.json({ error: "No puedes aprobar tu propio informe" }, { status: 403 });
  }
  if (paso.quien === "admin" && rol !== ROL.ADMIN) {
    return Response.json({ error: "Solo el administrador puede reabrir un informe cerrado" }, { status: 403 });
  }

  const observacion = (b.observations || "").toString().trim();
  if ((paso.hacia === "rechazado" || paso.hacia === "requiere_ajustes") && !observacion) {
    return Response.json({ error: "Indica qué se debe corregir" }, { status: 400 });
  }

  if (paso.quien === "autor") {
    await pool.query("UPDATE contract_monthly_reports SET status=?, submitted_at=NOW() WHERE id=?", [paso.hacia, id]);
  } else {
    await pool.query(
      "UPDATE contract_monthly_reports SET status=?, observations=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?",
      [paso.hacia, observacion || null, me.id, id]
    );
  }

  await auditar(pool, {
    me, contractId: informe.contract_id, entidad: "report", entidadId: id,
    accion: `MONTHLY_REPORT_${paso.hacia.toUpperCase()}`,
    descripcion: `Informe ${informe.month}/${informe.year}: ${informe.status} → ${paso.hacia}`,
    antes: informe.status, despues: paso.hacia, req,
  });
  return Response.json({ ok: true, status: paso.hacia });
}
