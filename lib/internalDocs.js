import { getCurrentUser } from "./auth";
import { getPool } from "./db";

export async function requireInternalAdmin() {
  const user = await getCurrentUser();
  if (!user) return { response: Response.json({ error: "No autorizado" }, { status: 401 }) };
  if (!user.isAdmin) return { response: Response.json({ error: "Acceso exclusivo para administradores" }, { status: 403 }) };
  return { user, pool: getPool() };
}

export async function logInternalEvent(pool, actorId, eventType, description, folderId = null, documentId = null) {
  await pool.query(
    "INSERT INTO internal_document_events (folder_id,document_id,actor_user_id,event_type,description) VALUES (?,?,?,?,?)",
    [folderId, documentId, actorId, eventType, description]
  );
}
