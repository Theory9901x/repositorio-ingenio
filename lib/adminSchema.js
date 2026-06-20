let ready = false;

export async function ensureAdminSchema(pool) {
  if (ready) return;
  const [columns] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='is_active'"
  );
  if (!columns.length) {
    await pool.query("ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1");
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
