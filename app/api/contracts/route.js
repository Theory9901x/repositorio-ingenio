import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = getPool();
  const [rows] = await pool.query("SELECT id, title, code, entity_name, description, status, DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at FROM contract_routes ORDER BY created_at DESC");
  return Response.json(rows);
}

export async function POST(req) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) return Response.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = (body.title || "").toString().trim();
  const code = (body.code || "").toString().trim() || null;
  const entityName = (body.entity_name || "").toString().trim() || null;
  const description = (body.description || "").toString().trim() || null;
  const status = (body.status || "activo").toString();
  if (!title) return Response.json({ error: "Nombre requerido" }, { status: 400 });
  const pool = getPool();
  const [result] = await pool.query("INSERT INTO contract_routes (title,code,entity_name,description,status,created_by) VALUES (?,?,?,?,?,?)", [title, code, entityName, description, status, me.id]);
  return Response.json({ ok: true, id: result.insertId });
}
