import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  const pool = getPool();
  const [[row]] = await pool.query("SELECT id, title, code, entity_name, description, status, DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at FROM contract_routes WHERE id=?", [id]);
  if (!row) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json(row);
}

export async function PUT(req, { params }) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const title = (body.title || "").toString().trim();
  const code = (body.code || "").toString().trim() || null;
  const entityName = (body.entity_name || "").toString().trim() || null;
  const description = (body.description || "").toString().trim() || null;
  const status = (body.status || "activo").toString();
  if (!title) return Response.json({ error: "Nombre requerido" }, { status: 400 });
  const pool = getPool();
  const [result] = await pool.query("UPDATE contract_routes SET title=?, code=?, entity_name=?, description=?, status=? WHERE id=?", [title, code, entityName, description, status, id]);
  if (!result.affectedRows) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  const pool = getPool();
  await pool.query("DELETE FROM contract_files WHERE contract_id=?", [id]);
  const [result] = await pool.query("DELETE FROM contract_routes WHERE id=?", [id]);
  if (!result.affectedRows) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json({ ok: true });
}
