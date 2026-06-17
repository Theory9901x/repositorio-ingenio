import { getPool } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";

export async function GET(req, { params }) {
  const pool = getPool();
  const [[doc]] = await pool.query(
    "SELECT file_name, file_mime, file_path FROM documents WHERE id=?",
    [Number(params.id)]
  );
  if (!doc || !doc.file_path) {
    return Response.json({ error: "Sin archivo" }, { status: 404 });
  }
  let data;
  try {
    data = await fs.readFile(path.join(UPLOAD_DIR, doc.file_path));
  } catch {
    return Response.json({ error: "Archivo no encontrado en disco" }, { status: 404 });
  }
  return new Response(data, {
    headers: {
      "Content-Type": doc.file_mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.file_name || "documento")}"`,
    },
  });
}
