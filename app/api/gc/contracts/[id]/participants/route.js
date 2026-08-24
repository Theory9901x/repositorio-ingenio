import { contexto, auditar, ROL } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

const ROLES_VALIDOS = new Set(["supervisor", "contratista", "apoyo", "tecnico", "financiero", "juridico", "revisor"]);

export async function GET(_req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, rol, contractId } = ctx;

  // El email solo se expone a quien administra el contrato.
  const email = rol === ROL.TRABAJADOR ? "NULL AS email" : "u.email";
  const [rows] = await pool.query(
    `SELECT cu.id, cu.user_id, cu.role_in_contract, cu.specialty, cu.status,
            DATE_FORMAT(cu.start_date,'%Y-%m-%d') start_date, DATE_FORMAT(cu.end_date,'%Y-%m-%d') end_date,
            u.full_name, u.cargo, ${email},
            (up.photo_data IS NOT NULL) AS has_photo,
            (SELECT COUNT(*) FROM contract_activities a WHERE a.contract_id=cu.contract_id AND a.user_id=cu.user_id) AS actividades,
            (SELECT COUNT(*) FROM contract_evidences ev WHERE ev.contract_id=cu.contract_id AND ev.user_id=cu.user_id AND ev.status='validada') AS evidencias_validadas
       FROM contract_users cu
       JOIN users u ON u.id=cu.user_id
       LEFT JOIN user_profiles up ON up.user_id=u.id
      WHERE cu.contract_id=?
      ORDER BY cu.role_in_contract='supervisor' DESC, u.full_name`,
    [contractId]
  );
  return Response.json(rows);
}

export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "PARTICIPANT_MANAGE");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const b = await req.json().catch(() => ({}));
  const userId = Number(b.user_id);
  const rolContrato = ROLES_VALIDOS.has(b.role_in_contract) ? b.role_in_contract : "contratista";
  if (!userId) return Response.json({ error: "Selecciona un usuario" }, { status: 400 });

  const [[usuario]] = await pool.query("SELECT full_name FROM users WHERE id=? AND is_active=1", [userId]);
  if (!usuario) return Response.json({ error: "El usuario no existe o está inactivo" }, { status: 400 });

  await pool.query(
    `INSERT INTO contract_users (contract_id, user_id, role_in_contract, specialty, status, start_date, end_date, assigned_by)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE role_in_contract=VALUES(role_in_contract), specialty=VALUES(specialty),
                             status=VALUES(status), start_date=VALUES(start_date), end_date=VALUES(end_date)`,
    [contractId, userId, rolContrato, b.specialty || null, b.status || "activo", b.start_date || null, b.end_date || null, me.id]
  );
  await pool.query("INSERT IGNORE INTO contract_members (contract_id, user_id) VALUES (?,?)", [contractId, userId]);
  await auditar(pool, { me, contractId, entidad: "participant", entidadId: userId, accion: "PARTICIPANT_ADDED", descripcion: `${usuario.full_name} asociado como ${rolContrato}`, req });
  return Response.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const ctx = await contexto(params.id, "PARTICIPANT_MANAGE");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const userId = Number(new URL(req.url).searchParams.get("userId"));
  if (!userId) return Response.json({ error: "Usuario no indicado" }, { status: 400 });

  // Retirar a alguien con trabajo registrado borraría su historial: se bloquea.
  const [[trabajo]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM contract_activities WHERE contract_id=? AND user_id=?) AS actividades,
            (SELECT COUNT(*) FROM contract_evidences WHERE contract_id=? AND user_id=?) AS evidencias`,
    [contractId, userId, contractId, userId]
  );
  if (trabajo.actividades || trabajo.evidencias) {
    return Response.json(
      { error: `No se puede retirar: tiene ${trabajo.actividades} actividad(es) y ${trabajo.evidencias} evidencia(s) registradas. Cambia su estado a inactivo.` },
      { status: 409 }
    );
  }

  const [[usuario]] = await pool.query("SELECT full_name FROM users WHERE id=?", [userId]);
  await pool.query("DELETE FROM contract_users WHERE contract_id=? AND user_id=?", [contractId, userId]);
  await pool.query("DELETE FROM contract_members WHERE contract_id=? AND user_id=?", [contractId, userId]);
  await auditar(pool, { me, contractId, entidad: "participant", entidadId: userId, accion: "PARTICIPANT_REMOVED", descripcion: `${usuario?.full_name || "Usuario"} retirado del contrato` });
  return Response.json({ ok: true });
}
