import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT f.id, f.document_id, DATE_FORMAT(f.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,
            d.code, d.name, d.process_id, d.type_id, d.version, d.state, d.file_name, (d.file_path IS NOT NULL) AS has_file
     FROM favorite_documents f
     JOIN documents d ON d.id = f.document_id
     WHERE f.user_id=? ORDER BY f.created_at DESC`,
    [me.id]
  );
  return Response.json(rows);
}

export async function POST(req) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const documentId = Number(body.documentId);
  if (!documentId) return Response.json({ error: "Documento requerido" }, { status: 400 });
  const pool = getPool();
  const [[doc]] = await pool.query("SELECT id FROM documents WHERE id=?", [documentId]);
  if (!doc) return Response.json({ error: "Documento no encontrado" }, { status: 404 });
  await pool.query("INSERT IGNORE INTO favorite_documents (user_id,document_id) VALUES (?,?)", [me.id, documentId]);
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const documentId = Number(body.documentId);
  if (!documentId) return Response.json({ error: "Documento requerido" }, { status: 400 });
  const pool = getPool();
  await pool.query("DELETE FROM favorite_documents WHERE user_id=? AND document_id=?", [me.id, documentId]);
  return Response.json({ ok: true });
}
