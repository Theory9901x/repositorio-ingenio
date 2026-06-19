import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFeatureSchema } from "@/lib/featureSchema";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = getPool();
  await ensureFeatureSchema(pool);
  const [rows] = await pool.query(`SELECT c.id,c.title,c.code,c.entity_name,c.description,c.status,DATE_FORMAT(c.created_at,'%Y-%m-%d %H:%i:%s') created_at FROM contract_routes c WHERE ? OR EXISTS(SELECT 1 FROM contract_members m WHERE m.contract_id=c.id AND m.user_id=?) ORDER BY c.created_at DESC`,[me.isAdmin?1:0,me.id]);
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
