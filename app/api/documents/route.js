import { getPool } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";

export async function GET() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, code, name, process_id, type_id, consecutive, version, state, origin,
            is_public, DATE_FORMAT(due_date,'%Y-%m-%d') AS due_date,
            file_name, (file_path IS NOT NULL) AS has_file
     FROM documents ORDER BY code`
  );
  return Response.json(rows);
}

export async function POST(req) {
  if (!isAuthed()) return Response.json({ error: "No autorizado" }, { status: 401 });
  const pool = getPool();
  const fd = await req.formData();

  const name = (fd.get("name") || "").toString().trim();
  const processId = Number(fd.get("processId"));
  const typeId = Number(fd.get("typeId"));
  const state = (fd.get("state") || "no_publicado").toString();
  const origin = (fd.get("origin") || "interno").toString();
  const isPublic = fd.get("isPublic") === "true" ? 1 : 0;
  const due = (fd.get("due") || "").toString() || null;

  if (!name || !processId || !typeId)
    return Response.json({ error: "Faltan campos" }, { status: 400 });

  const [[mx]] = await pool.query(
    "SELECT COALESCE(MAX(consecutive),0)+1 AS c FROM documents WHERE process_id=? AND type_id=?",
    [processId, typeId]
  );
  const consec = mx.c;
  const [[proc]] = await pool.query("SELECT sigla FROM processes WHERE id=?", [processId]);
  const [[type]] = await pool.query("SELECT sigla FROM doc_types WHERE id=?", [typeId]);
  const code = `GI-${proc.sigla}-${type.sigla}-${String(consec).padStart(2, "0")}`;

  // archivo opcional -> se guarda en disco (UPLOAD_DIR)
  let fileName = null, fileMime = null, filePath = null;
  const file = fd.get("file");
  if (file && typeof file === "object" && file.size > 0) {
    const ext = path.extname(file.name) || "";
    const stored = crypto.randomUUID() + ext;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));
    fileName = file.name;
    fileMime = file.type || "application/octet-stream";
    filePath = stored;
  }

  await pool.query(
    `INSERT INTO documents (code,name,process_id,type_id,consecutive,version,state,origin,is_public,due_date,file_name,file_mime,file_path)
     VALUES (?,?,?,?,?, '1.0', ?,?,?,?,?,?,?)`,
    [code, name, processId, typeId, consec, state, origin, isPublic, due, fileName, fileMime, filePath]
  );

  return Response.json({ ok: true, code });
}
