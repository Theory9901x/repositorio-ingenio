import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const allowedSections = new Set(["workplan", "personal", "favorites"]);

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, user_id, parent_id, name, section, DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at
     FROM workspace_folders WHERE user_id=? ORDER BY section, parent_id IS NOT NULL, name`,
    [me.id]
  );
  return Response.json(rows);
}

export async function POST(req) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").toString().trim();
  const section = allowedSections.has(body.section) ? body.section : "personal";
  const parentId = body.parent_id ? Number(body.parent_id) : null;
  if (!name) return Response.json({ error: "Nombre requerido" }, { status: 400 });

  const pool = getPool();
  if (parentId) {
    const [[parent]] = await pool.query("SELECT id FROM workspace_folders WHERE id=? AND user_id=?", [parentId, me.id]);
    if (!parent) return Response.json({ error: "Carpeta padre inválida" }, { status: 400 });
  }
  const [result] = await pool.query(
    "INSERT INTO workspace_folders (user_id,parent_id,name,section) VALUES (?,?,?,?)",
    [me.id, parentId, name, section]
  );
  return Response.json({ ok: true, id: result.insertId });
}
