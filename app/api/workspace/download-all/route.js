import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createZip, safeZipName, uniqueZipPath } from "@/lib/zip";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";
const MAX_BYTES = 250 * 1024 * 1024;

export async function GET(req) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const folderParam = url.searchParams.get("folderId");
  const rootId = folderParam ? Number(folderParam) : null;
  const scope = url.searchParams.get("scope") === "folder" ? "folder" : "all";

  const pool = getPool();
  const [folders] = await pool.query(
    "SELECT id, parent_id, name FROM workspace_folders WHERE user_id=?",
    [me.id]
  );
  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (id) => {
    const parts = [];
    const seen = new Set();
    let cur = id ? byId.get(Number(id)) : null;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(safeZipName(cur.name));
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    return parts;
  };

  // Solo archivos propios del usuario; las referencias al repositorio
  // institucional no se empaquetan porque no son archivos suyos.
  let sql = `SELECT id, folder_id, title, file_name, file_path, size_bytes, created_at
             FROM workspace_files
             WHERE user_id=? AND source='personal' AND file_path IS NOT NULL`;
  const args = [me.id];

  if (scope === "folder") {
    if (rootId && !byId.has(rootId)) return Response.json({ error: "Carpeta inválida" }, { status: 404 });
    if (rootId) {
      // La carpeta pedida más todas sus subcarpetas.
      const ids = new Set([rootId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of folders) {
          if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
        }
      }
      sql += ` AND folder_id IN (${[...ids].map(() => "?").join(",")})`;
      args.push(...ids);
    } else {
      sql += " AND folder_id IS NULL";
    }
  }

  const [rows] = await pool.query(sql + " ORDER BY created_at DESC", args);
  if (!rows.length) return Response.json({ error: "No hay archivos para descargar" }, { status: 404 });

  // Al descargar una carpeta concreta, las rutas del ZIP se vuelven relativas
  // a ella (incluyéndola como directorio raíz).
  const trim = scope === "folder" && rootId ? pathOf(rootId).length - 1 : 0;

  const used = new Set();
  const entries = [];
  let total = 0;
  let omitidos = 0;

  for (const row of rows) {
    if (total + Number(row.size_bytes || 0) > MAX_BYTES) { omitidos++; continue; }
    let data;
    try {
      data = await fs.readFile(path.join(UPLOAD_DIR, row.file_path));
    } catch {
      omitidos++;
      continue;
    }
    total += data.length;
    const dirs = pathOf(row.folder_id).slice(trim);
    const base = safeZipName(row.file_name || row.title || `archivo-${row.id}`);
    entries.push({
      name: uniqueZipPath([...dirs, base].join("/"), used),
      data,
      date: new Date(row.created_at),
    });
  }

  if (!entries.length) return Response.json({ error: "No se pudo leer ningún archivo" }, { status: 404 });

  const zipName = scope === "folder" && rootId
    ? `${safeZipName(byId.get(rootId)?.name || "carpeta")}.zip`
    : "mi-espacio.zip";
  const zip = createZip(entries);

  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.length),
      "Content-Disposition": `attachment; filename="descarga.zip"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      "X-Archivos-Incluidos": String(entries.length),
      "X-Archivos-Omitidos": String(omitidos),
    },
  });
}
