import { contextoCm, CATEGORIAS } from "@/lib/cm/schema";

export const dynamic = "force-dynamic";

// Datos de entrada del módulo: métricas, categorías con conteo, etiquetas
// populares, conversaciones destacadas y miembros activos.
export async function GET() {
  const ctx = await contextoCm();
  if (ctx.error) return ctx.error;
  const { pool, me, rol, permisos } = ctx;

  const [[metricas]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM forum_topics WHERE status='PUBLISHED') AS conversaciones,
            (SELECT COUNT(*) FROM forum_comments) AS comentarios,
            (SELECT COUNT(*) FROM forum_reactions) + (SELECT COUNT(*) FROM forum_comment_reactions) AS reacciones,
            (SELECT COUNT(DISTINCT author_id) FROM forum_topics) AS personas`
  );

  const [conteos] = await pool.query(
    "SELECT type, COUNT(*) AS n FROM forum_topics WHERE status='PUBLISHED' GROUP BY type"
  );
  const porTipo = Object.fromEntries(conteos.map((c) => [c.type, Number(c.n)]));
  const categorias = [
    { slug: "todo", nombre: "Todo", descripcion: "Todas las conversaciones", total: Number(metricas.conversaciones) },
    ...CATEGORIAS.map((c) => ({ ...c, total: porTipo[c.slug] || 0 })),
  ];

  const [etiquetas] = await pool.query(
    `SELECT t.id, t.name, t.slug, COUNT(tt.topic_id) AS total
       FROM forum_tags t LEFT JOIN forum_topic_tags tt ON tt.tag_id=t.id
      GROUP BY t.id ORDER BY total DESC, t.name LIMIT 12`
  );

  const [destacadas] = await pool.query(
    `SELECT ft.id, ft.title, ft.type, ft.is_pinned,
            (SELECT COUNT(*) FROM forum_comments c WHERE c.topic_id=ft.id) AS comentarios
       FROM forum_topics ft WHERE ft.status='PUBLISHED'
      ORDER BY ft.is_pinned DESC, comentarios DESC, ft.created_at DESC LIMIT 3`
  );

  const [miembros] = await pool.query(
    `SELECT u.id, u.full_name, u.cargo, (up.photo_data IS NOT NULL) AS has_photo,
            (SELECT COUNT(*) FROM forum_topics t WHERE t.author_id=u.id) +
            (SELECT COUNT(*) FROM forum_comments c WHERE c.author_id=u.id) AS aportes
       FROM users u LEFT JOIN user_profiles up ON up.user_id=u.id
      WHERE u.is_active=1 ORDER BY aportes DESC, u.full_name LIMIT 24`
  );

  const [[guardados]] = await pool.query("SELECT COUNT(*) AS n FROM forum_bookmarks WHERE user_id=?", [me.id]);

  return Response.json({
    me: { id: me.id, full_name: me.full_name, cargo: me.cargo, isAdmin: !!me.isAdmin },
    rol, permisos,
    metricas: [
      { id: "conversaciones", label: "Conversaciones", valor: Number(metricas.conversaciones) },
      { id: "comentarios", label: "Comentarios", valor: Number(metricas.comentarios) },
      { id: "reacciones", label: "Reacciones", valor: Number(metricas.reacciones) },
      { id: "personas", label: "Personas activas", valor: Number(metricas.personas) },
    ],
    categorias, etiquetas, destacadas, miembros,
    guardados: Number(guardados.n),
  });
}
