import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";

export async function GET(_req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  const pool = getPool();
  const [[file]] = await pool.query(
    "SELECT file_name, file_path, mime_type FROM workspace_files WHERE id=? AND user_id=? AND source='personal'",
    [id, me.id]
  );
  if (!file?.file_path) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
  const buf = await fs.readFile(path.join(UPLOAD_DIR, file.file_path));
  return new Response(buf, {
    headers: {
      "Content-Type": file.mime_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.file_name || "archivo")}"`,
    },
  });
}
