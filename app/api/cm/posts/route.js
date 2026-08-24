import { contextoCm, CATEGORIAS, slugify, avisarMenciones } from "@/lib/cm/schema";
import { avisar, usuariosActivos } from "@/lib/notificaciones";
import { guardarArchivo, FileError } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

const TIPOS = new Set(CATEGORIAS.map((c) => c.slug));
const POR_PAGINA = 12;

export async function GET(req) {
  const ctx = await contextoCm();
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo");
  const etiqueta = url.searchParams.get("etiqueta");
  const orden = url.searchParams.get("orden") || "recientes";
  const q = (url.searchParams.get("q") || "").trim();
  const guardados = url.searchParams.get("guardados") === "1";
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);

  const condiciones = ["ft.status='PUBLISHED'"];
  const args = [me.id, me.id];

  if (tipo && TIPOS.has(tipo)) { condiciones.push("ft.type=?"); args.push(tipo); }
  if (etiqueta) {
    condiciones.push("EXISTS (SELECT 1 FROM forum_topic_tags tt JOIN forum_tags tg ON tg.id=tt.tag_id WHERE tt.topic_id=ft.id AND tg.slug=?)");
    args.push(etiqueta);
  }
  if (guardados) { condiciones.push("EXISTS (SELECT 1 FROM forum_bookmarks b WHERE b.topic_id=ft.id AND b.user_id=?)"); args.push(me.id); }
  if (q) {
    condiciones.push("(ft.title LIKE ? OR ft.body LIKE ? OR u.full_name LIKE ?)");
    const like = `%${q}%`;
    args.push(like, like, like);
  }

  const ordenSql = {
    recientes: "ft.is_pinned DESC, ft.created_at DESC",
    populares: "ft.is_pinned DESC, reacciones DESC, comentarios DESC",
    sin_responder: "ft.is_pinned DESC, comentarios ASC, ft.created_at DESC",
  }[orden] || "ft.is_pinned DESC, ft.created_at DESC";

  const where = condiciones.join(" AND ");
  const offset = (pagina - 1) * POR_PAGINA;

  const [posts] = await pool.query(
    `SELECT ft.id, ft.title, ft.body, ft.type, ft.status, ft.is_pinned, ft.accepted_comment_id, ft.closed_at,
            DATE_FORMAT(ft.created_at,'%Y-%m-%d %H:%i') created_at,
            ft.author_id, u.full_name AS author_name, u.cargo AS author_cargo,
            (up.photo_data IS NOT NULL) AS author_photo,
            (SELECT COUNT(*) FROM forum_comments c WHERE c.topic_id=ft.id) AS comentarios,
            (SELECT COUNT(*) FROM forum_reactions r WHERE r.topic_id=ft.id) AS reacciones,
            (SELECT COUNT(*) FROM forum_attachments a WHERE a.topic_id=ft.id) AS adjuntos,
            EXISTS (SELECT 1 FROM forum_reactions r2 WHERE r2.topic_id=ft.id AND r2.user_id=?) AS reaccionado,
            EXISTS (SELECT 1 FROM forum_bookmarks b2 WHERE b2.topic_id=ft.id AND b2.user_id=?) AS guardado
       FROM forum_topics ft
       JOIN users u ON u.id=ft.author_id
       LEFT JOIN user_profiles up ON up.user_id=u.id
      WHERE ${where}
      ORDER BY ${ordenSql}
      LIMIT ${POR_PAGINA + 1} OFFSET ${offset}`,
    args
  );

  const hayMas = posts.length > POR_PAGINA;
  const pagina_ = posts.slice(0, POR_PAGINA);

  // Etiquetas de los temas devueltos, en una sola consulta.
  if (pagina_.length) {
    const ids = pagina_.map((p) => p.id);
    const [tags] = await pool.query(
      `SELECT tt.topic_id, tg.name, tg.slug FROM forum_topic_tags tt
         JOIN forum_tags tg ON tg.id=tt.tag_id
        WHERE tt.topic_id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    const porTema = {};
    for (const t of tags) (porTema[t.topic_id] ||= []).push(t);
    pagina_.forEach((p) => { p.etiquetas = porTema[p.id] || []; });
  }

  return Response.json({ posts: pagina_, pagina, hayMas });
}

export async function POST(req) {
  const ctx = await contextoCm("POST_CREATE");
  if (ctx.error) return ctx.error;
  const { pool, me, rol } = ctx;

  try {
    const esForm = (req.headers.get("content-type") || "").includes("multipart/form-data");
    const fd = esForm ? await req.formData() : null;
    const cuerpo = esForm ? Object.fromEntries(fd.entries()) : await req.json().catch(() => ({}));

    const title = (cuerpo.title || "").toString().trim();
    const body = (cuerpo.body || "").toString().trim();
    if (!title) return Response.json({ error: "El título es obligatorio" }, { status: 400 });
    if (!body) return Response.json({ error: "Escribe el contenido de la publicación" }, { status: 400 });

    let tipo = TIPOS.has(cuerpo.type) ? cuerpo.type : "general";
    // Los anuncios institucionales quedan reservados a quien modera.
    if (tipo === "anuncio" && rol === "TRABAJADOR") tipo = "general";

    const [r] = await pool.query(
      "INSERT INTO forum_topics (title, body, author_id, type, category, status, is_published) VALUES (?,?,?,?,?, 'PUBLISHED', 1)",
      [title, body, me.id, tipo, tipo]
    );
    const topicId = r.insertId;

    // Etiquetas: se crean si no existen.
    const etiquetas = String(cuerpo.tags || "").split(/[,\s]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean).slice(0, 6);
    for (const nombre of etiquetas) {
      const slug = slugify(nombre);
      if (!slug) continue;
      await pool.query("INSERT INTO forum_tags (name, slug) VALUES (?,?) ON DUPLICATE KEY UPDATE name=VALUES(name)", [nombre.slice(0, 60), slug]);
      const [[tag]] = await pool.query("SELECT id FROM forum_tags WHERE slug=?", [slug]);
      if (tag) await pool.query("INSERT IGNORE INTO forum_topic_tags (topic_id, tag_id) VALUES (?,?)", [topicId, tag.id]);
    }

    // Adjuntos de la publicación.
    if (esForm) {
      for (const archivo of fd.getAll("files").filter((f) => f && typeof f === "object")) {
        const g = await guardarArchivo(archivo, `comunidad/${topicId}`, me.id);
        await pool.query(
          "INSERT INTO forum_attachments (topic_id, uploaded_by, file_name, file_path, mime_type, size_bytes) VALUES (?,?,?,?,?,?)",
          [topicId, me.id, g.file_name, g.file_path, g.mime_type, g.size_bytes]
        );
      }
    }

    // Menciones: se avisa a las personas nombradas con @.
    await avisarMenciones(pool, me, body, topicId, title);

    // Y la publicación en sí se anuncia a toda la organización.
    await avisar(pool, {
      para: await usuariosActivos(pool), actorId: me.id,
      tipo: "forum", entidadId: topicId,
      titulo: `${me.full_name} publicó en Comunidad`,
      mensaje: title, severidad: tipo === "anuncio" ? "warning" : "info",
      link: `/comunidad?post=${topicId}`,
    });

    return Response.json({ ok: true, id: topicId });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "No se pudo publicar: " + e.message }, { status: 500 });
  }
}
