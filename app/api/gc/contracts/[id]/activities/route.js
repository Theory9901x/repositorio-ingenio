import { contexto, auditar, esPropio, ROL } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

// Asegura que exista el periodo (contrato + usuario + año + mes).
async function obtenerPeriodo(pool, contractId, userId, year, month) {
  await pool.query(
    "INSERT IGNORE INTO contract_activity_periods (contract_id, user_id, year, month) VALUES (?,?,?,?)",
    [contractId, userId, year, month]
  );
  const [[p]] = await pool.query(
    "SELECT * FROM contract_activity_periods WHERE contract_id=? AND user_id=? AND year=? AND month=?",
    [contractId, userId, year, month]
  );
  return p;
}

// GET ?userId&year&month  → actividades de ese periodo
// GET ?userId             → listado de periodos con su resumen
export async function GET(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  const url = new URL(req.url);

  // El trabajador siempre consulta sus propias actividades.
  const userId = rol === ROL.TRABAJADOR ? me.id : Number(url.searchParams.get("userId")) || me.id;
  if (!esPropio(rol, me, userId)) return Response.json({ error: "No puedes consultar actividades de otro usuario" }, { status: 403 });

  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));

  if (!year || !month) {
    // Periodos existentes más el mes actual, con resumen por periodo.
    const [periodos] = await pool.query(
      `SELECT p.id, p.year, p.month, p.status,
              (SELECT COUNT(*) FROM contract_activities a WHERE a.contract_id=p.contract_id AND a.user_id=p.user_id
                 AND YEAR(COALESCE(a.activity_date,a.created_at))=p.year AND MONTH(COALESCE(a.activity_date,a.created_at))=p.month) AS actividades,
              (SELECT COUNT(*) FROM contract_activities a WHERE a.contract_id=p.contract_id AND a.user_id=p.user_id
                 AND a.status='approved'
                 AND YEAR(COALESCE(a.activity_date,a.created_at))=p.year AND MONTH(COALESCE(a.activity_date,a.created_at))=p.month) AS aprobadas,
              (SELECT m.status FROM contract_monthly_reports m WHERE m.contract_id=p.contract_id AND m.user_id=p.user_id
                 AND m.year=p.year AND m.month=p.month) AS informe_estado
         FROM contract_activity_periods p
        WHERE p.contract_id=? AND p.user_id=?
        ORDER BY p.year DESC, p.month DESC`,
      [contractId, userId]
    );
    return Response.json({ userId, periodos });
  }

  const periodo = await obtenerPeriodo(pool, contractId, userId, year, month);
  const [actividades] = await pool.query(
    `SELECT a.id, a.title, a.description, a.category, a.status, a.user_observation, a.admin_comment, a.result,
            DATE_FORMAT(a.activity_date,'%Y-%m-%d') activity_date,
            DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i') created_at,
            a.user_id, u.full_name AS user_name, rv.full_name AS reviewer_name,
            (SELECT COUNT(*) FROM contract_activity_files f WHERE f.activity_id=a.id) AS anexos
       FROM contract_activities a
       JOIN users u ON u.id=a.user_id
       LEFT JOIN users rv ON rv.id=a.reviewed_by
      WHERE a.contract_id=? AND a.user_id=?
        AND YEAR(COALESCE(a.activity_date,a.created_at))=? AND MONTH(COALESCE(a.activity_date,a.created_at))=?
      ORDER BY COALESCE(a.activity_date,a.created_at) ASC, a.id ASC`,
    [contractId, userId, year, month]
  );
  const [[informe]] = await pool.query(
    "SELECT * FROM contract_monthly_reports WHERE contract_id=? AND user_id=? AND year=? AND month=?",
    [contractId, userId, year, month]
  );
  return Response.json({ userId, periodo, actividades, informe: informe || null });
}

export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  const b = await req.json().catch(() => ({}));

  // Nadie registra actividades a nombre de otro salvo el administrador.
  const userId = rol === ROL.ADMIN && b.user_id ? Number(b.user_id) : me.id;
  if (rol === ROL.SUPERVISOR && Number(userId) !== Number(me.id)) {
    return Response.json({ error: "El supervisor revisa actividades, no las registra por el contratista" }, { status: 403 });
  }

  const title = (b.title || "").toString().trim();
  if (!title) return Response.json({ error: "El nombre de la actividad es obligatorio" }, { status: 400 });
  const fecha = b.activity_date || new Date().toISOString().slice(0, 10);
  const d = new Date(fecha + "T00:00:00");
  if (isNaN(d)) return Response.json({ error: "Fecha de ejecución inválida" }, { status: 400 });

  const periodo = await obtenerPeriodo(pool, contractId, userId, d.getFullYear(), d.getMonth() + 1);
  if (periodo.status === "cerrado" && rol !== ROL.ADMIN) {
    return Response.json({ error: "El periodo está cerrado; no admite nuevas actividades" }, { status: 409 });
  }

  const [r] = await pool.query(
    `INSERT INTO contract_activities (contract_id, user_id, title, description, category, activity_date, status, user_observation, result, period_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [contractId, userId, title, b.description || null, b.category || null, fecha,
     b.status === "submitted" ? "submitted" : "draft", b.user_observation || null, b.result || null, periodo.id]
  );
  await auditar(pool, { me, contractId, entidad: "activity", entidadId: r.insertId, accion: "ACTIVITY_CREATED", descripcion: `Actividad registrada: ${title}`, req });
  return Response.json({ ok: true, id: r.insertId });
}
