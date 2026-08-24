import { contextoCm, notificar } from "@/lib/cm/schema";
import { borrarArchivo } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

async function abrir(id) {
  const ctx = await contextoCm();
  if (ctx.error) return ctx;
  const [[comentario]] = await ctx.pool.query(
    `SELECT c.*, t.author_id AS topic_author_id, t.title AS topic_title, t.type AS topic_type, t.closed_at
       FROM forum_comments c JOIN forum_topics t ON t.id=c.topic_id WHERE c.id=?`,
    [Number(id)]
  );
  if (!comentario) return { error: Response.json({ error: "Comentario no encontrado" }, { status: 404 }) };
  return { ...ctx, comentario, commentId: Number(id) };
}

export async function PATCH(req, { params }) {
  const ctx = await abrir(params.id);
  if (ctx.error) return ctx.error;
  const { pool, me, permisos, comentario, commentId } = ctx;
  const b = await req.json().catch(() => ({}));
  const propio = Number(comentario.author_id) === Number(me.id);

  if (b.accion === "reaccionar") {
    const [[ya]] = await pool.query("SELECT 1 AS ok FROM forum_comment_reactions WHERE comment_id=? AND user_id=?", [commentId, me.id]);
    if (ya) await pool.query("DELETE FROM forum_comment_reactions WHERE comment_id=? AND user_id=?", [commentId, me.id]);
    else await pool.query("INSERT INTO forum_comment_reactions (comment_id, user_id) VALUES (?,?)", [commentId, me.id]);
    return Response.json({ ok: true, reaccionado: !ya });
  }

  if (b.accion === "aceptar") {
    // Solo el autor de la pregunta (o quien modera) marca la respuesta aceptada.
    const esAutorTema = Number(comentario.topic_author_id) === Number(me.id);
    if (!esAutorTema && !permisos.includes("MODERATE")) {
      return Response.json({ error: "Solo quien preguntó puede aceptar una respuesta" }, { status: 403 });
    }
    if (comentario.topic_type !== "pregunta") {
      return Response.json({ error: "Solo las preguntas admiten respuesta aceptada" }, { status: 409 });
    }
    if (propio) return Response.json({ error: "No puedes aceptar tu propia respuesta" }, { status: 403 });

    const aceptar = !comentario.is_accepted;
    await pool.query("UPDATE forum_comments SET is_accepted=0 WHERE topic_id=?", [comentario.topic_id]);
    if (aceptar) await pool.query("UPDATE forum_comments SET is_accepted=1 WHERE id=?", [commentId]);
    await pool.query("UPDATE forum_topics SET accepted_comment_id=? WHERE id=?", [aceptar ? commentId : null, comentario.topic_id]);
    if (aceptar) {
      await notificar(pool, { userId: comentario.author_id, actorId: me.id, topicId: comentario.topic_id,
        titulo: "Tu respuesta fue aceptada", mensaje: comentario.topic_title });
    }
    return Response.json({ ok: true, aceptada: aceptar });
  }

  // Edición del comentario.
  if (!propio) return Response.json({ error: "Solo el autor puede editar su comentario" }, { status: 403 });
  const body = (b.body || "").toString().trim();
  if (!body) return Response.json({ error: "El comentario no puede quedar vacío" }, { status: 400 });
  await pool.query("UPDATE forum_comments SET body=? WHERE id=?", [body, commentId]);
  return Response.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const ctx = await abrir(params.id);
  if (ctx.error) return ctx.error;
  const { pool, me, permisos, comentario, commentId } = ctx;
  const propio = Number(comentario.author_id) === Number(me.id);
  if (!propio && !permisos.includes("COMMENT_DELETE_ANY")) {
    return Response.json({ error: "Solo el autor o un administrador pueden eliminar" }, { status: 403 });
  }

  const [adjuntos] = await pool.query(
    "SELECT file_path FROM forum_attachments WHERE comment_id=? OR comment_id IN (SELECT id FROM forum_comments WHERE parent_id=?)",
    [commentId, commentId]
  );
  await pool.query("DELETE FROM forum_attachments WHERE comment_id=? OR comment_id IN (SELECT id FROM forum_comments WHERE parent_id=?)", [commentId, commentId]);
  await pool.query("DELETE FROM forum_comment_reactions WHERE comment_id=? OR comment_id IN (SELECT id FROM forum_comments WHERE parent_id=?)", [commentId, commentId]);
  await pool.query("UPDATE forum_topics SET accepted_comment_id=NULL WHERE accepted_comment_id=?", [commentId]);
  // Al eliminar un comentario raíz se eliminan también sus respuestas.
  await pool.query("DELETE FROM forum_comments WHERE parent_id=?", [commentId]);
  await pool.query("DELETE FROM forum_comments WHERE id=?", [commentId]);
  for (const a of adjuntos) await borrarArchivo(a.file_path);

  return Response.json({ ok: true });
}
