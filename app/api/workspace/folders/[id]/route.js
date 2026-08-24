import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";

export async function PUT(req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").toString().trim();
  if (!id || !name) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const pool = getPool();
  const [result] = await pool.query("UPDATE workspace_folders SET name=? WHERE id=? AND user_id=?", [name, id, me.id]);
  if (!result.affectedRows) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json({ ok: true });
}

// Elimina la carpeta junto con sus subcarpetas y archivos.
// Para exigir que la carpeta esté vacía, llamar con ?soloVacia=1.
export async function DELETE(req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(params.id);
  if (!id) return Response.json({ error: "ID inválido" }, { status: 400 });

  const pool = getPool();
  const [[folder]] = await pool.query(
    "SELECT id FROM workspace_folders WHERE id=? AND user_id=?",
    [id, me.id]
  );
  if (!folder) return Response.json({ error: "La carpeta no existe o no es tuya" }, { status: 404 });

  const [folders] = await pool.query("SELECT id, parent_id FROM workspace_folders WHERE user_id=?", [me.id]);

  // La carpeta más todo su subárbol.
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
    }
  }
  const placeholders = [...ids].map(() => "?").join(",");

  const [files] = await pool.query(
    `SELECT id, file_path FROM workspace_files WHERE user_id=? AND folder_id IN (${placeholders})`,
    [me.id, ...ids]
  );

  if (new URL(req.url).searchParams.get("soloVacia") === "1" && (files.length || ids.size > 1)) {
    return Response.json({ error: "La carpeta debe estar vacía" }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (files.length) {
      await conn.query(
        `DELETE FROM workspace_files WHERE user_id=? AND folder_id IN (${placeholders})`,
        [me.id, ...ids]
      );
    }
    await conn.query(
      `DELETE FROM workspace_folders WHERE user_id=? AND id IN (${placeholders})`,
      [me.id, ...ids]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    return Response.json({ error: "No se pudo eliminar la carpeta" }, { status: 500 });
  } finally {
    conn.release();
  }

  // Los archivos en disco se borran después de confirmar la transacción.
  for (const file of files) {
    if (file.file_path) await fs.unlink(path.join(UPLOAD_DIR, file.file_path)).catch(() => {});
  }

  return Response.json({ ok: true, carpetas: ids.size, archivos: files.length });
}
