import { getCurrentUser } from "./auth";
import { getPool } from "./db";

let schemaReady = false;
async function ensureInternalSchema(pool) {
  if (schemaReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS internal_folders (
    id INT AUTO_INCREMENT PRIMARY KEY,parent_id INT NULL,name VARCHAR(220) NOT NULL,description TEXT NULL,
    created_by INT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(parent_id),INDEX(created_by)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS internal_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,folder_id INT NULL,title VARCHAR(255) NOT NULL,description TEXT NULL,
    original_file_name VARCHAR(255),stored_file_path VARCHAR(255),mime_type VARCHAR(160),size_bytes BIGINT,
    document_type VARCHAR(120),tags TEXT,status VARCHAR(40) DEFAULT 'vigente',access_level VARCHAR(40) DEFAULT 'admin_only',
    observations TEXT,uploaded_by INT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(folder_id),INDEX(uploaded_by),INDEX(status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS internal_document_events (
    id INT AUTO_INCREMENT PRIMARY KEY,folder_id INT NULL,document_id INT NULL,actor_user_id INT NOT NULL,
    event_type VARCHAR(80) NOT NULL,description TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(folder_id),INDEX(document_id),INDEX(actor_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  schemaReady = true;
}

export async function requireInternalAdmin() {
  const user = await getCurrentUser();
  if (!user) return { response: Response.json({ error: "No autorizado" }, { status: 401 }) };
  if (!user.isAdmin) return { response: Response.json({ error: "Acceso exclusivo para administradores" }, { status: 403 }) };
  const pool = getPool();
  await ensureInternalSchema(pool);
  return { user, pool };
}

export async function logInternalEvent(pool, actorId, eventType, description, folderId = null, documentId = null) {
  await pool.query(
    "INSERT INTO internal_document_events (folder_id,document_id,actor_user_id,event_type,description) VALUES (?,?,?,?,?)",
    [folderId, documentId, actorId, eventType, description]
  );
}
