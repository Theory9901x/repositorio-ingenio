import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";

export async function DELETE(_req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  if (!id) return Response.json({ error: "ID inválido" }, { status: 400 });

  const pool = getPool();
  const [[file]] = await pool.query(
    "SELECT id, file_path, source FROM workspace_files WHERE id=? AND user_id=?",
    [id, me.id]
  );
  if (!file) return Response.json({ error: "El archivo no existe o no es tuyo" }, { status: 404 });

  try {
    const [result] = await pool.query("DELETE FROM workspace_files WHERE id=? AND user_id=?", [id, me.id]);
    if (!result.affectedRows) return Response.json({ error: "No se pudo eliminar el archivo" }, { status: 500 });
  } catch (err) {
    return Response.json({ error: "No se pudo eliminar el archivo" }, { status: 500 });
  }

  if (file.source === "personal" && file.file_path) {
    await fs.unlink(path.join(UPLOAD_DIR, file.file_path)).catch(() => {});
  }
  return Response.json({ ok: true });
}
