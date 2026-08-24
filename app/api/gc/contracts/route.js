import { contexto, auditar, filtroContratosVisibles } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const ctx = await contexto();
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const companyId = new URL(req.url).searchParams.get("companyId");
  const { where, args } = filtroContratosVisibles(me);
  const extra = companyId ? " AND c.company_id=?" : "";

  const [rows] = await pool.query(
    `SELECT c.id, c.title, c.code, c.status, c.company_id, c.entity_name, c.object, c.description,
            DATE_FORMAT(c.start_date,'%Y-%m-%d') start_date,
            DATE_FORMAT(c.end_date,'%Y-%m-%d') end_date,
            c.internal_responsible_id, u.full_name AS responsible_name, emp.name AS company_name,
            (SELECT COUNT(*) FROM contract_users cu WHERE cu.contract_id=c.id) AS participantes,
            (SELECT COUNT(*) FROM contract_document_submissions s WHERE s.contract_id=c.id AND s.status='enviado') AS por_revisar,
            DATEDIFF(c.end_date, CURDATE()) AS dias_para_vencer
       FROM contract_routes c
       LEFT JOIN users u ON u.id=c.internal_responsible_id
       LEFT JOIN contract_companies emp ON emp.id=c.company_id
      WHERE ${where}${extra}
      ORDER BY c.status='activo' DESC, c.title`,
    companyId ? [...args, Number(companyId)] : args
  );
  return Response.json(rows);
}

export async function POST(req) {
  const ctx = await contexto(undefined, "CONTRACT_CREATE");
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const b = await req.json().catch(() => ({}));
  const title = (b.title || "").toString().trim();
  if (!title) return Response.json({ error: "El nombre del contrato es obligatorio" }, { status: 400 });

  let companyId = b.company_id ? Number(b.company_id) : null;
  let entityName = null;
  if (companyId) {
    const [[emp]] = await pool.query("SELECT name FROM contract_companies WHERE id=?", [companyId]);
    if (!emp) return Response.json({ error: "La empresa indicada no existe" }, { status: 400 });
    entityName = emp.name;
  }

  const [r] = await pool.query(
    `INSERT INTO contract_routes
       (title, code, entity_name, company_id, object, description, start_date, end_date, status, internal_responsible_id, value_amount, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [title, b.code || null, entityName, companyId, b.object || null, b.description || null,
     b.start_date || null, b.end_date || null, b.status || "activo",
     b.internal_responsible_id || null, b.value_amount || null, me.id]
  );
  await auditar(pool, { me, contractId: r.insertId, entidad: "contract", entidadId: r.insertId, accion: "CONTRACT_CREATED", descripcion: `Contrato creado: ${title}`, req });
  return Response.json({ ok: true, id: r.insertId });
}
