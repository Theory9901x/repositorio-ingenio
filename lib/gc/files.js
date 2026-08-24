import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// Servicio único de archivos del módulo contractual: validación, guardado,
// entrega y borrado. Evita duplicar esta lógica en cada submódulo.

const ROOT = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";
const MAX_BYTES = 60 * 1024 * 1024;

const EXT_PERMITIDAS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".txt", ".rtf", ".odt",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".heic",
  ".mp4", ".mov", ".avi", ".mkv", ".mp3", ".wav",
  ".zip", ".rar", ".7z", ".dwg", ".kml", ".kmz",
]);

export class FileError extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

// Guarda un archivo del FormData dentro de una subcarpeta del módulo.
export async function guardarArchivo(file, subcarpeta, userId) {
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    throw new FileError("Archivo requerido");
  }
  if (!file.size) throw new FileError("El archivo está vacío");
  if (file.size > MAX_BYTES) {
    throw new FileError(`El archivo supera el máximo permitido (${Math.round(MAX_BYTES / 1024 / 1024)} MB)`, 413);
  }
  const ext = path.extname(file.name || "").toLowerCase();
  if (ext && !EXT_PERMITIDAS.has(ext)) throw new FileError(`Tipo de archivo no permitido (${ext})`);

  const dir = path.join(ROOT, "contratos", subcarpeta);
  await fs.mkdir(dir, { recursive: true });
  const stored = `${userId || 0}-${crypto.randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, stored), buffer);

  return {
    file_name: file.name || `archivo${ext}`,
    file_path: path.posix.join("contratos", subcarpeta, stored),
    mime_type: file.type || "application/octet-stream",
    size_bytes: buffer.length,
  };
}

// Guarda un archivo generado por el sistema (por ejemplo un informe en PDF).
export async function guardarBuffer(buffer, subcarpeta, nombre, mime, userId) {
  const dir = path.join(ROOT, "contratos", subcarpeta);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(nombre) || "";
  const stored = `${userId || 0}-${crypto.randomUUID()}${ext}`;
  await fs.writeFile(path.join(dir, stored), buffer);
  return {
    file_name: nombre,
    file_path: path.posix.join("contratos", subcarpeta, stored),
    mime_type: mime,
    size_bytes: buffer.length,
  };
}

export async function borrarArchivo(filePath) {
  if (!filePath) return;
  await fs.unlink(path.join(ROOT, filePath)).catch(() => {});
}

// Respuesta de descarga o vista previa a partir de un registro con file_path.
export async function responderArchivo(registro, { descargar = false } = {}) {
  if (!registro?.file_path) return Response.json({ error: "Sin archivo" }, { status: 404 });
  let buf;
  try {
    buf = await fs.readFile(path.join(ROOT, registro.file_path));
  } catch {
    return Response.json({ error: "Archivo no encontrado en disco" }, { status: 404 });
  }
  const nombre = registro.file_name || "archivo";
  const ascii = nombre.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new Response(buf, {
    headers: {
      "Content-Type": registro.mime_type || "application/octet-stream",
      "Content-Length": String(buf.length),
      "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    },
  });
}
