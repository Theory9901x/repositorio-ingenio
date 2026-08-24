import { contextoCm, notificar, avisarMenciones } from "@/lib/cm/schema";
import { guardarArchivo, FileError } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const ctx = await contextoCm();
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const topicId = Number(params.id);
  const orden = new URL(req.url).searchParams.get("orden") === "valoradas"
    ? "c.is_accepted DESC, reacciones DESC, c.created_at ASC"
    : "c.is_accepted DESC, c.created_at ASC";

  const [comentarios] = await pool.query(
    `SELECT c.id, c.topic_id, c.parent_id, c.body, c.is_accepted, c.author_id,
            DATE_FORMAT(c.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name AS author_name, u.cargo AS author_cargo,
            (up.photo_data IS NOT NULL) AS author_photo,
            (SELECT COUNT(*) FROM forum_comment_reactions r WHERE r.comment_id=c.id) AS reacciones,
            EXISTS (SELECT 1 FROM forum_comment_reactions r2 WHERE r2.comment_id=c.id AND r2.user_id=?) AS reaccionado
       FROM forum_comments c
       JOIN users u ON u.id=c.author_id
       LEFT JOIN user_profiles up ON up.user_id=u.id
      WHERE c.topic_id=?
      ORDER BY ${orden}`,
    [me.id, topicId]
  );

  const [adjuntos] = await pool.query(
    `SELECT a.id, a.comment_id, a.file_name, a.mime_type, a.size_bytes
       FROM forum_attachments a JOIN forum_comments c ON c.id=a.comment_id WHERE c.topic_id=?`,
    [topicId]
  );
  const porComentario = {};
  for (const a of adjuntos) (porComentario[a.comment_id] ||= []).push(a);
  comentarios.forEach((c) => { c.adjuntos = porComentario[c.id] || []; });

  // Máximo dos niveles: las respuestas cuelgan de su comentario raíz.
  const raiz = comentarios.filter((c) => !c.parent_id);
  const hijos = comentarios.filter((c) => c.parent_id);
  raiz.forEach((c) => { c.respuestas = hijos.filter((h) => h.parent_id === c.id); });

  return Response.json({ comentarios: raiz, total: comentarios.length });
}

export async function POST(req, { params }) {
  const ctx = await contextoCm("COMMENT_CREATE");
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const topicId = Number(params.id);

  const [[post]] = await pool.query("SELECT id, title, author_id, closed_at FROM forum_topics WHERE id=?", [topicId]);
  if (!post) return Response.json({ error: "Publicación no encontrada" }, { status: 404 });
  if (post.closed_at) return Response.json({ error: "La conversación está cerrada" }, { status: 409 });

  try {
    const esForm = (req.headers.get("content-type") || "").includes("multipart/form-data");
    const fd = esForm ? await req.formData() : null;
    const datos = esForm ? Object.fromEntries(fd.entries()) : await req.json().catch(() => ({}));

    const body = (datos.body || "").toString().trim();
    if (!body) return Response.json({ error: "Escribe un comentario" }, { status: 400 });

    // Solo se admite un nivel de anidamiento: la respuesta a una respuesta
    // se reasigna al comentario raíz.
    let parentId = datos.parent_id ? Number(datos.parent_id) : null;
    if (parentId) {
      const [[padre]] = await pool.query("SELECT id, parent_id, author_id FROM forum_comments WHERE id=? AND topic_id=?", [parentId, topicId]);
      if (!padre) parentId = null;
      else if (padre.parent_id) parentId = padre.parent_id;
    }

    const [r] = await pool.query(
      "INSERT INTO forum_comments (topic_id, author_id, parent_id, body) VALUES (?,?,?,?)",
      [topicId, me.id, parentId, body]
    );

    if (esForm) {
      for (const archivo of fd.getAll("files").filter((f) => f && typeof f === "object")) {
        const g = await guardarArchivo(archivo, `comunidad/${topicId}`, me.id);
        await pool.query(
          "INSERT INTO forum_attachments (comment_id, uploaded_by, file_name, file_path, mime_type, size_bytes) VALUES (?,?,?,?,?,?)",
          [r.insertId, me.id, g.file_name, g.file_path, g.mime_type, g.size_bytes]
        );
      }
    }

    await notificar(pool, { userId: post.author_id, actorId: me.id, topicId, titulo: `${me.full_name} comentó tu publicación`, mensaje: post.title });
    if (parentId) {
      const [[padre]] = await pool.query("SELECT author_id FROM forum_comments WHERE id=?", [parentId]);
      if (padre) await notificar(pool, { userId: padre.author_id, actorId: me.id, topicId, titulo: `${me.full_name} respondió tu comentario`, mensaje: post.title });
    }
    await avisarMenciones(pool, me, body, topicId, post.title);

    return Response.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "No se pudo comentar: " + e.message }, { status: 500 });
  }
}
