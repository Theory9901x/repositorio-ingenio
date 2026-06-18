import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PUT(req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").toString().trim();
  if (!id || !name) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const pool = getPool();
  const [result] = await pool.query("UPDATE workspace_folders SET name=? WHERE id=? AND user_id=?", [name, id, me.id]);
  if (!result.affectedRows) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  if (!id) return Response.json({ error: "ID inválido" }, { status: 400 });
  const pool = getPool();
  const [[child]] = await pool.query("SELECT COUNT(*) AS c FROM workspace_folders WHERE parent_id=? AND user_id=?", [id, me.id]);
  const [[files]] = await pool.query("SELECT COUNT(*) AS c FROM workspace_files WHERE folder_id=? AND user_id=?", [id, me.id]);
  if (child.c || files.c) return Response.json({ error: "La carpeta debe estar vacía" }, { status: 400 });
  const [result] = await pool.query("DELETE FROM workspace_folders WHERE id=? AND user_id=?", [id, me.id]);
  if (!result.affectedRows) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json({ ok: true });
}
