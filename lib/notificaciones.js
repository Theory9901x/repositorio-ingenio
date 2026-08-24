import { ensurePlatformSchema } from "@/lib/platformSchema";

// Notificaciones personales. Se apoyan en system_alerts, la tabla que ya
// alimentaba el centro de alertas: cada fila con user_id es de una persona.
// Lo único que faltaba era el enlace directo al sitio donde se resuelve.

let listo = false;

export async function ensureNotificaciones(pool) {
  if (listo) return pool;
  await ensurePlatformSchema(pool);
  const [cols] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='system_alerts' AND COLUMN_NAME='link'"
  );
  if (!cols.length) await pool.query("ALTER TABLE system_alerts ADD COLUMN link VARCHAR(255) NULL");
  listo = true;
  return pool;
}

// Destinatarios habituales -------------------------------------------------

export async function usuariosActivos(pool) {
  const [rows] = await pool.query("SELECT id FROM users WHERE is_active=1");
  return rows.map((r) => r.id);
}

// Todo el que participa en el contrato: asignados, miembros y el responsable.
export async function usuariosDelContrato(pool, contractId) {
  const [rows] = await pool.query(
    `SELECT user_id FROM contract_users WHERE contract_id=?
     UNION SELECT user_id FROM contract_members WHERE contract_id=?
     UNION SELECT internal_responsible_id FROM contract_routes WHERE id=? AND internal_responsible_id IS NOT NULL`,
    [contractId, contractId, contractId]
  );
  return rows.map((r) => r.user_id).filter(Boolean);
}

// Quien revisa: responsable del contrato, roles de supervisión y administradores.
export async function revisoresDelContrato(pool, contractId) {
  const [rows] = await pool.query(
    `SELECT u.user_id FROM contract_users u
      WHERE u.contract_id=? AND LOWER(u.role_in_contract) IN ('supervisor','revisor','interventor')
     UNION SELECT internal_responsible_id FROM contract_routes WHERE id=? AND internal_responsible_id IS NOT NULL
     UNION SELECT id FROM users WHERE role='admin' AND is_active=1`,
    [contractId, contractId]
  );
  return rows.map((r) => r.user_id).filter(Boolean);
}

// Emisión ------------------------------------------------------------------

// Crea una notificación por destinatario. Nadie se notifica a sí mismo y no se
// repite un aviso del mismo hecho que la persona todavía no ha leído.
export async function avisar(pool, {
  para, actorId, tipo, entidadId = null, contractId = null,
  titulo, mensaje = null, severidad = "info", link = null,
}) {
  const destinos = [...new Set((Array.isArray(para) ? para : [para]).map(Number).filter(Boolean))]
    .filter((id) => id !== Number(actorId));
  if (!destinos.length || !titulo) return 0;

  try {
    await ensureNotificaciones(pool);
    let creadas = 0;
    for (const userId of destinos) {
      const [[repetida]] = await pool.query(
        `SELECT id FROM system_alerts
          WHERE user_id=? AND related_type=? AND related_id<=>? AND title=? AND status='unread' LIMIT 1`,
        [userId, tipo, entidadId, titulo.slice(0, 220)]
      );
      if (repetida) continue;
      await pool.query(
        `INSERT INTO system_alerts (user_id, contract_id, related_type, related_id, title, message, severity, status, link)
         VALUES (?,?,?,?,?,?,?, 'unread', ?)`,
        [userId, contractId, tipo, entidadId, titulo.slice(0, 220), mensaje, severidad, link]
      );
      creadas += 1;
    }
    return creadas;
  } catch {
    // Una notificación nunca debe tumbar la acción que la origina.
    return 0;
  }
}
