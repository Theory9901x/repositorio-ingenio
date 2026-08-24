import { contextoCm } from "@/lib/cm/schema";
import { responderArchivo } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

// Los adjuntos de Comunidad son visibles para cualquier persona autenticada,
// igual que la publicación a la que pertenecen.
export async function GET(req) {
  const ctx = await contextoCm();
  if (ctx.error) return ctx.error;
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return Response.json({ error: "Archivo no indicado" }, { status: 400 });

  const [[archivo]] = await ctx.pool.query(
    "SELECT file_name, file_path, mime_type FROM forum_attachments WHERE id=?",
    [id]
  );
  if (!archivo) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });

  return responderArchivo(archivo, { descargar: url.searchParams.get("download") === "1" });
}
