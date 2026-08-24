import { contextoCm, notificar } from "@/lib/cm/schema";
import { borrarArchivo } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

async function abrir(id) {
  const ctx = await contextoCm();
  if (ctx.error) return ctx;
  const [[post]] = await ctx.pool.query("SELECT * FROM forum_topics WHERE id=?", [Number(id)]);
  if (!post) return { error: Response.json({ error: "Publicación no encontrada" }, { status: 404 }) };
  return { ...ctx, post, topicId: Number(id) };
}

export async function GET(_req, { params }) {
  const ctx = await abrir(params.id);
  if (ctx.error) return ctx.error;
  const { pool, me, topicId } = ctx;

  await pool.query("UPDATE forum_topics SET view_count=view_count+1 WHERE id=?", [topicId]).catch(() => {});

  const [[post]] = await pool.query(
    `SELECT ft.*, DATE_FORMAT(ft.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name AS author_name, u.cargo AS author_cargo,
            (up.photo_data IS NOT NULL) AS author_photo,
            (SELECT COUNT(*) FROM forum_reactions r WHERE r.topic_id=ft.id) AS reacciones,
            (SELECT COUNT(*) FROM forum_comments c WHERE c.topic_id=ft.id) AS comentarios,
            EXISTS (SELECT 1 FROM forum_reactions r2 WHERE r2.topic_id=ft.id AND r2.user_id=?) AS reaccionado,
            EXISTS (SELECT 1 FROM forum_bookmarks b WHERE b.topic_id=ft.id AND b.user_id=?) AS guardado
       FROM forum_topics ft JOIN users u ON u.id=ft.author_id
       LEFT JOIN user_profiles up ON up.user_id=u.id
      WHERE ft.id=?`,
    [me.id, me.id, topicId]
  );
  const [etiquetas] = await pool.query(
    "SELECT tg.name, tg.slug FROM forum_topic_tags tt JOIN forum_tags tg ON tg.id=tt.tag_id WHERE tt.topic_id=?",
    [topicId]
  );
  const [adjuntos] = await pool.query(
    "SELECT id, file_name, mime_type, size_bytes FROM forum_attachments WHERE topic_id=? ORDER BY created_at",
    [topicId]
  );
  return Response.json({ post, etiquetas, adjuntos });
}

export async function PATCH(req, { params }) {
  const ctx = await abrir(params.id);
  if (ctx.error) return ctx.error;
  const { pool, me, rol, permisos, post, topicId } = ctx;
  const b = await req.json().catch(() => ({}));
  const propio = Number(post.author_id) === Number(me.id);

  // Acciones de moderación y de interacción.
  if (b.accion) {
    switch (b.accion) {
      case "reaccionar": {
        const [[ya]] = await pool.query("SELECT 1 AS ok FROM forum_reactions WHERE topic_id=? AND user_id=?", [topicId, me.id]);
        if (ya) await pool.query("DELETE FROM forum_reactions WHERE topic_id=? AND user_id=?", [topicId, me.id]);
        else {
          await pool.query("INSERT INTO forum_reactions (topic_id, user_id) VALUES (?,?)", [topicId, me.id]);
          await notificar(pool, { userId: post.author_id, actorId: me.id, topicId, titulo: `A ${me.full_name} le gustó tu publicación`, mensaje: post.title });
        }
        return Response.json({ ok: true, reaccionado: !ya });
      }
      case "guardar": {
        const [[ya]] = await pool.query("SELECT 1 AS ok FROM forum_bookmarks WHERE topic_id=? AND user_id=?", [topicId, me.id]);
        if (ya) await pool.query("DELETE FROM forum_bookmarks WHERE topic_id=? AND user_id=?", [topicId, me.id]);
        else await pool.query("INSERT INTO forum_bookmarks (topic_id, user_id) VALUES (?,?)", [topicId, me.id]);
        return Response.json({ ok: true, guardado: !ya });
      }
      case "fijar": {
        if (!permisos.includes("POST_PIN")) return Response.json({ error: "No puedes fijar publicaciones" }, { status: 403 });
        await pool.query("UPDATE forum_topics SET is_pinned=? WHERE id=?", [post.is_pinned ? 0 : 1, topicId]);
        if (!post.is_pinned) {
          await notificar(pool, { userId: post.author_id, actorId: me.id, topicId, titulo: "Tu publicación fue fijada", mensaje: post.title });
        }
        return Response.json({ ok: true, fijado: !post.is_pinned });
      }
      case "cerrar": {
        if (!permisos.includes("POST_CLOSE") && !propio) return Response.json({ error: "No puedes cerrar esta conversación" }, { status: 403 });
        const cerrar = !post.closed_at;
        await pool.query("UPDATE forum_topics SET closed_at=?, status=? WHERE id=?", [cerrar ? new Date() : null, cerrar ? "CLOSED" : "PUBLISHED", topicId]);
        return Response.json({ ok: true, cerrado: cerrar });
      }
      default:
        return Response.json({ error: "Acción no válida" }, { status: 400 });
    }
  }

  // Edición del contenido.
  if (!propio && !permisos.includes("POST_EDIT_ANY")) {
    return Response.json({ error: "Solo el autor puede editar la publicación" }, { status: 403 });
  }
  const title = (b.title || "").toString().trim();
  const body = (b.body || "").toString().trim();
  if (!title || !body) return Response.json({ error: "El título y el contenido son obligatorios" }, { status: 400 });
  await pool.query("UPDATE forum_topics SET title=?, body=? WHERE id=?", [title, body, topicId]);
  return Response.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const ctx = await abrir(params.id);
  if (ctx.error) return ctx.error;
  const { pool, me, permisos, post, topicId } = ctx;
  const propio = Number(post.author_id) === Number(me.id);
  if (!propio && !permisos.includes("POST_DELETE_ANY")) {
    return Response.json({ error: "Solo el autor o un administrador pueden eliminar" }, { status: 403 });
  }

  const [adjuntos] = await pool.query("SELECT file_path FROM forum_attachments WHERE topic_id=?", [topicId]);
  const [adjComentarios] = await pool.query(
    "SELECT file_path FROM forum_attachments WHERE comment_id IN (SELECT id FROM forum_comments WHERE topic_id=?)",
    [topicId]
  );
  await pool.query("DELETE FROM forum_comment_reactions WHERE comment_id IN (SELECT id FROM forum_comments WHERE topic_id=?)", [topicId]);
  await pool.query("DELETE FROM forum_attachments WHERE topic_id=? OR comment_id IN (SELECT id FROM forum_comments WHERE topic_id=?)", [topicId, topicId]);
  await pool.query("DELETE FROM forum_comments WHERE topic_id=?", [topicId]);
  await pool.query("DELETE FROM forum_reactions WHERE topic_id=?", [topicId]);
  await pool.query("DELETE FROM forum_bookmarks WHERE topic_id=?", [topicId]);
  await pool.query("DELETE FROM forum_topic_tags WHERE topic_id=?", [topicId]);
  await pool.query("DELETE FROM forum_topics WHERE id=?", [topicId]);
  for (const a of [...adjuntos, ...adjComentarios]) await borrarArchivo(a.file_path);

  return Response.json({ ok: true });
}
