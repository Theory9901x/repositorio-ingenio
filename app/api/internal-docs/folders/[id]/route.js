import { requireInternalAdmin, logInternalEvent } from "@/lib/internalDocs";
export async function PUT(req, { params }) {
  const auth = await requireInternalAdmin(); if (auth.response) return auth.response;
  const body = await req.json().catch(() => ({})); const name = String(body.name || "").trim();
  if (!name) return Response.json({ error: "Nombre requerido" }, { status: 400 });
  const [result] = await auth.pool.query("UPDATE internal_folders SET name=?,description=? WHERE id=?", [name, body.description || null, params.id]);
  if (!result.affectedRows) return Response.json({ error: "Carpeta no encontrada" }, { status: 404 });
  await logInternalEvent(auth.pool, auth.user.id, "folder_renamed", `Carpeta renombrada: ${name}`, Number(params.id));
  return Response.json({ ok: true });
}
export async function DELETE(_req, { params }) {
  const auth = await requireInternalAdmin(); if (auth.response) return auth.response;
  const [[counts]] = await auth.pool.query(`SELECT (SELECT COUNT(*) FROM internal_folders WHERE parent_id=?) children,
    (SELECT COUNT(*) FROM internal_documents WHERE folder_id=? AND status<>'eliminado') documents`, [params.id, params.id]);
  if (Number(counts.children) || Number(counts.documents)) return Response.json({ error: "La carpeta debe estar vacía para eliminarla" }, { status: 409 });
  await logInternalEvent(auth.pool, auth.user.id, "folder_deleted", "Carpeta eliminada", Number(params.id));
  await auth.pool.query("DELETE FROM internal_folders WHERE id=?", [params.id]); return Response.json({ ok: true });
}
