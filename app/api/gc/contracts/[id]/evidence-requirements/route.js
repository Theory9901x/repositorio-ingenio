import { contexto, auditar } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

// Catálogo sugerido al configurar un contrato por primera vez.
const PLANTILLA = [
  ["Hoja de vida", "Talento humano"],
  ["Cédula de ciudadanía", "Identificación"],
  ["RUT", "Tributaria"],
  ["Seguridad social", "Seguridad social"],
  ["Certificación bancaria", "Financiera"],
  ["Cuenta de cobro", "Financiera"],
  ["Informe mensual", "Operativa"],
  ["Registro fotográfico", "Operativa"],
  ["Certificación ARL", "Seguridad y salud"],
  ["Acta de entrega", "Operativa"],
];

export async function GET(_req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, contractId } = ctx;
  const [rows] = await pool.query(
    `SELECT r.*, DATE_FORMAT(r.due_date,'%Y-%m-%d') due_date, u.full_name AS assigned_name,
            (SELECT COUNT(*) FROM contract_evidences ev WHERE ev.requirement_id=r.id) AS cargadas,
            (SELECT COUNT(*) FROM contract_evidences ev WHERE ev.requirement_id=r.id AND ev.status='validada') AS validadas
       FROM contract_evidence_requirements r
       LEFT JOIN users u ON u.id=r.assigned_user_id
      WHERE r.contract_id=? ORDER BY r.sort_order, r.id`,
    [contractId]
  );
  return Response.json(rows);
}

export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "EVIDENCE_REQUIREMENT_MANAGE");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const b = await req.json().catch(() => ({}));

  // Alta masiva desde la plantilla, sin duplicar lo que ya exista.
  if (b.accion === "plantilla") {
    const [existentes] = await pool.query("SELECT name FROM contract_evidence_requirements WHERE contract_id=?", [contractId]);
    const ya = new Set(existentes.map((r) => r.name.toLowerCase()));
    let n = 0;
    for (const [nombre, categoria] of PLANTILLA) {
      if (ya.has(nombre.toLowerCase())) continue;
      await pool.query(
        "INSERT INTO contract_evidence_requirements (contract_id, name, category, required, frequency, sort_order, created_by) VALUES (?,?,?,1,'unica',?,?)",
        [contractId, nombre, categoria, n, me.id]
      );
      n++;
    }
    await auditar(pool, { me, contractId, entidad: "evidence_requirement", accion: "EVIDENCE_REQUIREMENTS_SEEDED", descripcion: `${n} requisitos de evidencia creados desde la plantilla`, req });
    return Response.json({ ok: true, creados: n });
  }

  const name = (b.name || "").toString().trim();
  if (!name) return Response.json({ error: "El nombre del requisito es obligatorio" }, { status: 400 });
  const [r] = await pool.query(
    `INSERT INTO contract_evidence_requirements (contract_id, name, category, description, required, frequency, due_date, applies_to, assigned_user_id, sort_order, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [contractId, name, b.category || null, b.description || null, b.required === false ? 0 : 1,
     b.frequency || "unica", b.due_date || null, b.assigned_user_id ? "usuario" : "todos",
     b.assigned_user_id || null, Number(b.sort_order) || 0, me.id]
  );
  await auditar(pool, { me, contractId, entidad: "evidence_requirement", entidadId: r.insertId, accion: "EVIDENCE_REQUIREMENT_CREATED", descripcion: `Requisito de evidencia creado: ${name}`, req });
  return Response.json({ ok: true, id: r.insertId });
}

export async function DELETE(req, { params }) {
  const ctx = await contexto(params.id, "EVIDENCE_REQUIREMENT_MANAGE");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const reqId = Number(new URL(req.url).searchParams.get("reqId"));
  if (!reqId) return Response.json({ error: "Requisito no indicado" }, { status: 400 });

  const [[requisito]] = await pool.query("SELECT name FROM contract_evidence_requirements WHERE id=? AND contract_id=?", [reqId, contractId]);
  if (!requisito) return Response.json({ error: "Requisito no encontrado" }, { status: 404 });

  const [[uso]] = await pool.query("SELECT COUNT(*) AS c FROM contract_evidences WHERE requirement_id=?", [reqId]);
  if (uso.c) return Response.json({ error: `No se puede eliminar: ya hay ${uso.c} evidencia(s) cargada(s) para este requisito` }, { status: 409 });

  await pool.query("DELETE FROM contract_evidence_requirements WHERE id=?", [reqId]);
  await auditar(pool, { me, contractId, entidad: "evidence_requirement", entidadId: reqId, accion: "EVIDENCE_REQUIREMENT_DELETED", descripcion: `Requisito eliminado: ${requisito.name}` });
  return Response.json({ ok: true });
}
