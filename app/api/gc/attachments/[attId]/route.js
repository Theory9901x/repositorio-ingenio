import { contexto, auditar, ROL } from "@/lib/gc/rbac";
import { ensureGcSchema } from "@/lib/gc/schema";
import { getCurrentUser } from "@/lib/auth";
import { borrarArchivo } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

export async function DELETE(_req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = await ensureGcSchema();
  const id = Number(params.attId);

  const [[anexo]] = await pool.query(
    `SELECT f.*, a.status AS activity_status, a.title AS activity_title
       FROM contract_activity_files f JOIN contract_activities a ON a.id=f.activity_id
      WHERE f.id=?`,
    [id]
  );
  if (!anexo) return Response.json({ error: "Anexo no encontrado" }, { status: 404 });

  const ctx = await contexto(anexo.contract_id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;

  const propio = Number(anexo.user_id) === Number(me.id);
  if (ctx.rol !== ROL.ADMIN && !propio) {
    return Response.json({ error: "Solo puedes eliminar tus propios anexos" }, { status: 403 });
  }
  if (anexo.activity_status === "approved" && ctx.rol !== ROL.ADMIN) {
    return Response.json({ error: "La actividad ya fue aprobada y sus anexos no se pueden eliminar" }, { status: 409 });
  }

  await pool.query("DELETE FROM contract_activity_files WHERE id=?", [id]);
  await borrarArchivo(anexo.file_path);
  await auditar(pool, { me, contractId: anexo.contract_id, entidad: "attachment", entidadId: id, accion: "FILE_DELETED", descripcion: `Anexo eliminado de «${anexo.activity_title}»: ${anexo.file_name}` });
  return Response.json({ ok: true });
}
