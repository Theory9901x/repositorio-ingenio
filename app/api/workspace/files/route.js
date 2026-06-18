import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";
const WORKSPACE_DIR = path.join(UPLOAD_DIR, "workspace");

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT wf.id, wf.user_id, wf.folder_id, wf.repo_document_id, wf.source, wf.title,
            wf.file_name, wf.file_path, wf.mime_type, wf.size_bytes,
            DATE_FORMAT(wf.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,
            d.code AS repo_code, d.name AS repo_name, d.process_id, d.type_id, d.version, d.state
     FROM workspace_files wf
     LEFT JOIN documents d ON d.id = wf.repo_document_id
     WHERE wf.user_id=? ORDER BY wf.created_at DESC`,
    [me.id]
  );
  return Response.json(rows);
}

export async function POST(req) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = getPool();
  const fd = await req.formData();
  const source = (fd.get("source") || "personal").toString();
  const folderId = fd.get("folderId") ? Number(fd.get("folderId")) : null;
  const title = (fd.get("title") || "").toString().trim();
  const repoDocumentId = fd.get("repoDocumentId") ? Number(fd.get("repoDocumentId")) : null;

  if (folderId) {
    const [[folder]] = await pool.query("SELECT id FROM workspace_folders WHERE id=? AND user_id=?", [folderId, me.id]);
    if (!folder) return Response.json({ error: "Carpeta inválida" }, { status: 400 });
  }

  if (source === "repo_reference") {
    if (!repoDocumentId) return Response.json({ error: "Documento requerido" }, { status: 400 });
    const [[doc]] = await pool.query("SELECT id, name FROM documents WHERE id=?", [repoDocumentId]);
    if (!doc) return Response.json({ error: "Documento no encontrado" }, { status: 404 });
    const [result] = await pool.query(
      "INSERT INTO workspace_files (user_id,folder_id,repo_document_id,source,title) VALUES (?,?,?,?,?)",
      [me.id, folderId, repoDocumentId, "repo_reference", title || doc.name]
    );
    return Response.json({ ok: true, id: result.insertId });
  }

  const file = fd.get("file");
  if (!file || typeof file !== "object" || file.size <= 0) return Response.json({ error: "Archivo requerido" }, { status: 400 });
  const ext = path.extname(file.name) || "";
  const stored = String(me.id) + "-" + crypto.randomUUID() + ext;
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
  await fs.writeFile(path.join(WORKSPACE_DIR, stored), Buffer.from(await file.arrayBuffer()));

  const [result] = await pool.query(
    "INSERT INTO workspace_files (user_id,folder_id,source,title,file_name,file_path,mime_type,size_bytes) VALUES (?,?,?,?,?,?,?,?)",
    [me.id, folderId, "personal", title || file.name, file.name, "workspace/" + stored, file.type || "application/octet-stream", file.size]
  );
  return Response.json({ ok: true, id: result.insertId });
}
