import { getCurrentUser } from "@/lib/auth";
import { ensureGcSchema } from "./schema";

// Control de acceso del módulo de Gestión Contractual.
// El rol efectivo no es global: depende del contrato que se esté consultando.

export const ROL = { ADMIN: "ADMIN", SUPERVISOR: "SUPERVISOR", TRABAJADOR: "TRABAJADOR" };

export const PERMISOS = {
  ADMIN: [
    "COMPANY_MANAGE", "CONTRACT_CREATE", "CONTRACT_UPDATE", "CONTRACT_DELETE", "CONTRACT_READ",
    "PARTICIPANT_MANAGE", "ACTIVITY_CREATE_OWN", "ACTIVITY_REVIEW", "ACTIVITY_DELETE_ANY",
    "DOCUMENT_UPLOAD", "DOCUMENT_DELETE_ANY", "EVIDENCE_REQUIREMENT_MANAGE",
    "EVIDENCE_UPLOAD_OWN", "EVIDENCE_VALIDATE", "REQUEST_CREATE", "REQUEST_RESPOND",
    "REPORT_SUBMIT_OWN", "REPORT_APPROVE", "AUDIT_READ",
  ],
  SUPERVISOR: [
    "CONTRACT_READ", "CONTRACT_UPDATE", "PARTICIPANT_MANAGE", "ACTIVITY_REVIEW",
    "DOCUMENT_UPLOAD", "EVIDENCE_REQUIREMENT_MANAGE", "EVIDENCE_VALIDATE",
    "REQUEST_CREATE", "REPORT_APPROVE", "AUDIT_READ",
  ],
  TRABAJADOR: [
    "CONTRACT_READ", "ACTIVITY_CREATE_OWN", "DOCUMENT_UPLOAD",
    "EVIDENCE_UPLOAD_OWN", "REQUEST_RESPOND", "REPORT_SUBMIT_OWN",
  ],
};

const SUPERVISOR_ROLES = new Set(["supervisor", "revisor", "interventor"]);

// Rol efectivo del usuario dentro de un contrato concreto.
export async function rolEnContrato(pool, me, contractId) {
  if (me.isAdmin) return ROL.ADMIN;
  const id = Number(contractId);
  if (!id) return null;
  const [[contrato]] = await pool.query(
    "SELECT internal_responsible_id FROM contract_routes WHERE id=?",
    [id]
  );
  if (!contrato) return null;
  if (Number(contrato.internal_responsible_id) === Number(me.id)) return ROL.SUPERVISOR;
  const [[part]] = await pool.query(
    "SELECT role_in_contract FROM contract_users WHERE contract_id=? AND user_id=? LIMIT 1",
    [id, me.id]
  );
  if (part) return SUPERVISOR_ROLES.has(String(part.role_in_contract || "").toLowerCase()) ? ROL.SUPERVISOR : ROL.TRABAJADOR;
  const [[miembro]] = await pool.query(
    "SELECT 1 AS ok FROM contract_members WHERE contract_id=? AND user_id=? LIMIT 1",
    [id, me.id]
  );
  return miembro ? ROL.TRABAJADOR : null;
}

export function puede(rol, permiso) {
  return !!rol && (PERMISOS[rol] || []).includes(permiso);
}

// Resuelve sesión + esquema + rol en el contrato de una sola vez.
// Devuelve { error } listo para retornar cuando el acceso no procede.
export async function contexto(contractId, permisoRequerido) {
  const me = await getCurrentUser();
  if (!me) return { error: Response.json({ error: "No autorizado" }, { status: 401 }) };
  const pool = await ensureGcSchema();

  if (contractId === undefined) {
    const rol = me.isAdmin ? ROL.ADMIN : null;
    if (permisoRequerido && !puede(rol, permisoRequerido)) {
      return { error: Response.json({ error: "No tienes permiso para esta acción" }, { status: 403 }) };
    }
    return { me, pool, rol };
  }

  const id = Number(contractId);
  const rol = await rolEnContrato(pool, me, id);
  if (!rol) return { error: Response.json({ error: "No tienes acceso a este contrato" }, { status: 403 }) };
  if (permisoRequerido && !puede(rol, permisoRequerido)) {
    return { error: Response.json({ error: "No tienes permiso para esta acción" }, { status: 403 }) };
  }
  return { me, pool, rol, contractId: id };
}

// Un trabajador solo puede operar sobre sus propios recursos.
export function esPropio(rol, me, userId) {
  if (rol === ROL.ADMIN || rol === ROL.SUPERVISOR) return true;
  return Number(userId) === Number(me.id);
}

// Contratos visibles según el rol, sin traer todo y filtrar después.
export function filtroContratosVisibles(me) {
  if (me.isAdmin) return { where: "1=1", args: [] };
  return {
    where: `(c.internal_responsible_id=?
             OR EXISTS (SELECT 1 FROM contract_users cu WHERE cu.contract_id=c.id AND cu.user_id=?)
             OR EXISTS (SELECT 1 FROM contract_members cm WHERE cm.contract_id=c.id AND cm.user_id=?))`,
    args: [me.id, me.id, me.id],
  };
}

export async function auditar(pool, { me, contractId, entidad, entidadId, accion, descripcion, antes, despues, req }) {
  const metadata = antes || despues ? JSON.stringify({ antes: antes ?? null, despues: despues ?? null }) : null;
  const ip = req?.headers?.get?.("x-forwarded-for") || null;
  await pool
    .query(
      "INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, contract_id, description, metadata, ip_address) VALUES (?,?,?,?,?,?,?,?)",
      [me?.id ?? null, accion, entidad, entidadId ?? null, contractId ?? null, descripcion || null, metadata, ip]
    )
    .catch(() => {});
  if (contractId) {
    await pool
      .query(
        "INSERT INTO contract_events (contract_id, actor_user_id, event_type, description) VALUES (?,?,?,?)",
        [contractId, me?.id ?? null, accion, (descripcion || accion).slice(0, 500)]
      )
      .catch(() => {});
  }
}
