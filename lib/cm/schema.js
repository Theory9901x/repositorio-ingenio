import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Esquema del módulo Comunidad. Amplía las tablas forum_* existentes
// (temas, comentarios y reacciones) con categorías, etiquetas, adjuntos,
// guardados, respuestas anidadas y respuesta aceptada.

let listo = false;

async function agregarColumnas(pool, tabla, defs) {
  const [rows] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    [tabla]
  );
  const existentes = new Set(rows.map((r) => r.COLUMN_NAME));
  for (const [nombre, tipo] of defs) {
    if (!existentes.has(nombre)) await pool.query(`ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${tipo}`);
  }
}

export const CATEGORIAS = [
  { slug: "general", nombre: "General", descripcion: "Conversaciones libres del equipo." },
  { slug: "pregunta", nombre: "Preguntas", descripcion: "Consultas que necesitan respuesta." },
  { slug: "conocimiento", nombre: "Conocimiento", descripcion: "Procedimientos, guías y buenas prácticas." },
  { slug: "proyecto", nombre: "Proyectos", descripcion: "Conversaciones de proyectos en curso." },
  { slug: "anuncio", nombre: "Anuncios", descripcion: "Información institucional importante." },
];

export async function ensureCmSchema() {
  const pool = getPool();
  if (listo) return pool;

  await agregarColumnas(pool, "forum_topics", [
    ["type", "VARCHAR(30) NOT NULL DEFAULT 'general'"],
    ["status", "VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED'"],
    ["is_pinned", "TINYINT(1) NOT NULL DEFAULT 0"],
    ["accepted_comment_id", "INT NULL"],
    ["view_count", "INT NOT NULL DEFAULT 0"],
    ["closed_at", "DATETIME NULL"],
  ]);
  await agregarColumnas(pool, "forum_comments", [
    ["parent_id", "INT NULL"],
    ["is_accepted", "TINYINT(1) NOT NULL DEFAULT 0"],
    ["updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
  ]);

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    slug VARCHAR(60) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tag (slug)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_topic_tags (
    topic_id INT NOT NULL, tag_id INT NOT NULL,
    PRIMARY KEY (topic_id, tag_id), INDEX idx_tt_tag (tag_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_bookmarks (
    topic_id INT NOT NULL, user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (topic_id, user_id), INDEX idx_bm_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_comment_reactions (
    comment_id INT NOT NULL, user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (comment_id, user_id), INDEX idx_cr_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS forum_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    topic_id INT NULL, comment_id INT NULL, uploaded_by INT NOT NULL,
    file_name VARCHAR(255) NOT NULL, file_path VARCHAR(255) NOT NULL,
    mime_type VARCHAR(160) NULL, size_bytes BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_att_topic (topic_id), INDEX idx_att_comment (comment_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Los temas antiguos usaban `category`; se copia a `type` una sola vez.
  await pool.query(
    "UPDATE forum_topics SET type=category WHERE (type IS NULL OR type='general') AND category IS NOT NULL AND category<>'' AND category<>'general'"
  ).catch(() => {});

  listo = true;
  return pool;
}

export const ROL = { ADMIN: "ADMIN", SUPERVISOR: "SUPERVISOR", TRABAJADOR: "TRABAJADOR" };

const PERMISOS = {
  ADMIN: ["POST_CREATE", "POST_EDIT_ANY", "POST_DELETE_ANY", "POST_PIN", "POST_CLOSE", "COMMENT_CREATE", "COMMENT_DELETE_ANY", "TAG_MANAGE", "MODERATE"],
  SUPERVISOR: ["POST_CREATE", "POST_PIN", "POST_CLOSE", "COMMENT_CREATE"],
  TRABAJADOR: ["POST_CREATE", "COMMENT_CREATE"],
};

// Resuelve sesión, esquema, rol y permisos del módulo.
export async function contextoCm(permisoRequerido) {
  const me = await getCurrentUser();
  if (!me) return { error: Response.json({ error: "No autorizado" }, { status: 401 }) };
  const pool = await ensureCmSchema();

  let rol = ROL.TRABAJADOR;
  if (me.isAdmin) rol = ROL.ADMIN;
  else {
    const [[sup]] = await pool.query(
      `SELECT 1 AS ok FROM contract_routes WHERE internal_responsible_id=?
       UNION SELECT 1 FROM contract_users WHERE user_id=? AND role_in_contract IN ('supervisor','revisor','interventor') LIMIT 1`,
      [me.id, me.id]
    );
    if (sup) rol = ROL.SUPERVISOR;
  }

  const permisos = PERMISOS[rol];
  if (permisoRequerido && !permisos.includes(permisoRequerido)) {
    return { error: Response.json({ error: "No tienes permiso para esta acción" }, { status: 403 }) };
  }
  return { me, pool, rol, permisos };
}

// Notificaciones del módulo, apoyadas en la tabla de alertas del sistema.
export async function notificar(pool, { userId, actorId, titulo, mensaje, topicId, tipo = "forum", link = null }) {
  if (!userId || Number(userId) === Number(actorId)) return; // nadie se notifica a sí mismo
  await pool
    .query(
      "INSERT INTO system_alerts (user_id, related_type, related_id, title, message, severity, status, link) VALUES (?,?,?,?,?, 'info', 'unread', ?)",
      [userId, tipo, topicId ?? null, titulo.slice(0, 220), mensaje ?? null, link]
    )
    .catch(() => {});
}

// Detecta @Nombre en el texto y notifica a los usuarios coincidentes.
export async function avisarMenciones(pool, me, texto, topicId, titulo) {
  const nombres = [...String(texto || "").matchAll(/@([\p{L}\p{N}._-]{3,40})/gu)].map((m) => m[1].replace(/[._-]/g, " ").trim());
  if (!nombres.length) return;
  const [usuarios] = await pool.query("SELECT id, full_name FROM users WHERE is_active=1");
  const normal = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");
  const avisados = new Set();
  for (const nombre of nombres) {
    const objetivo = normal(nombre);
    if (objetivo.length < 3) continue;
    const u = usuarios.find((x) => normal(x.full_name).startsWith(objetivo) || objetivo.startsWith(normal(x.full_name)));
    if (u && !avisados.has(u.id)) {
      avisados.add(u.id);
      await notificar(pool, { userId: u.id, actorId: me.id, topicId, titulo: `${me.full_name} te mencionó`, mensaje: titulo, link: `/comunidad?post=${topicId}` });
    }
  }
}

export function slugify(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
