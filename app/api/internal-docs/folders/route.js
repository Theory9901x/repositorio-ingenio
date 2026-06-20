import { requireInternalAdmin, logInternalEvent } from "@/lib/internalDocs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireInternalAdmin(); if (auth.response) return auth.response;
  const [rows] = await auth.pool.query(`SELECT f.*, u.full_name AS created_by_name,
    (SELECT COUNT(*) FROM internal_folders c WHERE c.parent_id=f.id) AS subfolder_count,
    (SELECT COUNT(*) FROM internal_documents d WHERE d.folder_id=f.id AND d.status<>'eliminado') AS document_count
    FROM internal_folders f LEFT JOIN users u ON u.id=f.created_by ORDER BY f.name`);
  return Response.json(rows);
}

export async function POST(req) {
  const auth = await requireInternalAdmin(); if (auth.response) return auth.response;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim(); const parentId = body.parent_id ? Number(body.parent_id) : null;
  if (!name) return Response.json({ error: "El nombre de la carpeta es obligatorio" }, { status: 400 });
  if (parentId) { const [[parent]] = await auth.pool.query("SELECT id FROM internal_folders WHERE id=?", [parentId]); if (!parent) return Response.json({ error: "Carpeta padre no encontrada" }, { status: 404 }); }
  const [result] = await auth.pool.query("INSERT INTO internal_folders(parent_id,name,description,created_by) VALUES (?,?,?,?)", [parentId, name, body.description || null, auth.user.id]);
  await logInternalEvent(auth.pool, auth.user.id, "folder_created", `Carpeta creada: ${name}`, result.insertId);
  return Response.json({ ok: true, id: result.insertId });
}
