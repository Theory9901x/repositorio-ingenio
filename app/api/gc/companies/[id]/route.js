import { contexto, auditar } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

export async function PUT(req, { params }) {
  const ctx = await contexto(undefined, "COMPANY_MANAGE");
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const id = Number(params.id);
  const b = await req.json().catch(() => ({}));
  const name = (b.name || "").toString().trim();
  if (!id || !name) return Response.json({ error: "Datos inválidos" }, { status: 400 });

  const [[antes]] = await pool.query("SELECT * FROM contract_companies WHERE id=?", [id]);
  if (!antes) return Response.json({ error: "Empresa no encontrada" }, { status: 404 });

  await pool.query(
    `UPDATE contract_companies SET name=?, nit=?, entity_type=?, status=?, internal_responsible_id=?, next_review_date=?, notes=?
      WHERE id=?`,
    [name, b.nit || null, b.entity_type || null, b.status || "activa",
     b.internal_responsible_id || null, b.next_review_date || null, b.notes || null, id]
  );
  await auditar(pool, { me, entidad: "company", entidadId: id, accion: "COMPANY_UPDATED", descripcion: `Empresa actualizada: ${name}`, antes: antes.name, despues: name, req });
  return Response.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const ctx = await contexto(undefined, "COMPANY_MANAGE");
  if (ctx.error) return ctx.error;
  const { pool, me } = ctx;
  const id = Number(params.id);
  const [[empresa]] = await pool.query("SELECT name FROM contract_companies WHERE id=?", [id]);
  if (!empresa) return Response.json({ error: "Empresa no encontrada" }, { status: 404 });

  // Una empresa con contratos no se elimina: primero hay que reasignarlos.
  const [[uso]] = await pool.query("SELECT COUNT(*) AS c FROM contract_routes WHERE company_id=?", [id]);
  if (uso.c) {
    return Response.json(
      { error: `No se puede eliminar: la empresa tiene ${uso.c} contrato(s) asociado(s)` },
      { status: 409 }
    );
  }
  await pool.query("DELETE FROM contract_companies WHERE id=?", [id]);
  await auditar(pool, { me, entidad: "company", entidadId: id, accion: "COMPANY_DELETED", descripcion: `Empresa eliminada: ${empresa.name}` });
  return Response.json({ ok: true });
}
