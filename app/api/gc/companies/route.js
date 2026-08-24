import { contexto, auditar } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error, pool } = await contexto();
  if (error) return error;
  const [rows] = await pool.query(
    `SELECT e.*, DATE_FORMAT(e.next_review_date,'%Y-%m-%d') next_review_date,
            u.full_name AS responsible_name,
            (SELECT COUNT(*) FROM contract_routes c WHERE c.company_id=e.id) AS contratos
       FROM contract_companies e
       LEFT JOIN users u ON u.id=e.internal_responsible_id
      ORDER BY e.status='activa' DESC, e.name`
  );
  return Response.json(rows);
}

export async function POST(req) {
  const ctx = await contexto(undefined, "COMPANY_MANAGE");
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const b = await req.json().catch(() => ({}));
  const name = (b.name || "").toString().trim();
  if (!name) return Response.json({ error: "El nombre de la empresa es obligatorio" }, { status: 400 });

  const [[dup]] = await pool.query("SELECT id FROM contract_companies WHERE name=?", [name]);
  if (dup) return Response.json({ error: "Ya existe una empresa con ese nombre" }, { status: 409 });

  const [r] = await pool.query(
    `INSERT INTO contract_companies (name, nit, entity_type, status, internal_responsible_id, next_review_date, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [name, b.nit || null, b.entity_type || null, b.status || "activa",
     b.internal_responsible_id || null, b.next_review_date || null, b.notes || null, me.id]
  );
  await auditar(pool, { me, entidad: "company", entidadId: r.insertId, accion: "COMPANY_CREATED", descripcion: `Empresa creada: ${name}`, req });
  return Response.json({ ok: true, id: r.insertId });
}
