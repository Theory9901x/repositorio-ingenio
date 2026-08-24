let ready = false;

// Convierte "Natalia Forero Bejarano" en "natalia.forero".
export function sugerirUsuario(nombreCompleto) {
  const partes = String(nombreCompleto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter(Boolean);
  if (!partes.length) return "usuario";
  const nombre = partes[0];
  const apellido = partes[1] || "";
  return (apellido ? `${nombre}.${apellido}` : nombre).slice(0, 60);
}

export async function ensureAdminSchema(pool) {
  if (ready) return;
  const [columns] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='is_active'"
  );
  if (!columns.length) {
    await pool.query("ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1");
  }

  // Nombre de usuario propio (por ejemplo nombre.apellido) como alternativa
  // al correo para iniciar sesión.
  const [conUsuario] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='username'"
  );
  if (!conUsuario.length) {
    await pool.query("ALTER TABLE users ADD COLUMN username VARCHAR(60) NULL");
    await pool.query("ALTER TABLE users ADD UNIQUE KEY uq_username (username)").catch(() => {});
    // A quien ya tenía cuenta se le asigna uno a partir de su nombre.
    const [existentes] = await pool.query("SELECT id, full_name FROM users WHERE username IS NULL");
    for (const u of existentes) {
      const base = sugerirUsuario(u.full_name);
      for (let i = 0; i < 20; i++) {
        const intento = i ? `${base}${i + 1}` : base;
        try { await pool.query("UPDATE users SET username=? WHERE id=?", [intento, u.id]); break; }
        catch { /* nombre ya tomado: se prueba el siguiente */ }
      }
    }
  }
  // Con nombre de usuario propio, el correo deja de ser obligatorio. Se
  // comprueba aparte porque la columna username puede existir desde antes.
  const [[correo]] = await pool.query(
    "SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='email'"
  );
  if (correo && correo.IS_NULLABLE === "NO") {
    await pool.query("ALTER TABLE users MODIFY COLUMN email VARCHAR(120) NULL").catch(() => {});
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS admin_events (
    id INT AUTO_INCREMENT PRIMARY KEY, actor_user_id INT NOT NULL,
    module_name VARCHAR(60) NOT NULL, action_type VARCHAR(60) NOT NULL,
    entity_id INT NULL, description VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(actor_user_id), INDEX(module_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ready = true;
}

export async function addAdminEvent(pool, actorId, moduleName, actionType, entityId, description) {
  await pool.query("INSERT INTO admin_events(actor_user_id,module_name,action_type,entity_id,description) VALUES(?,?,?,?,?)", [actorId,moduleName,actionType,entityId||null,description]);
}
