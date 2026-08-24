import { contexto, auditar, ROL } from "@/lib/gc/rbac";
import { guardarArchivo, borrarArchivo, FileError } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

// Cronograma de trabajo de cada persona en el contrato: es el punto de
// partida, antes de registrar las mesas de trabajo del periodo.

export async function GET(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;

  // El trabajador solo ve el suyo; quien supervisa, el de todo el equipo.
  const soloMio = rol === ROL.TRABAJADOR;
  const pedido = Number(new URL(req.url).searchParams.get("userId")) || null;
  const args = [contractId];
  let filtro = "";
  if (soloMio) { filtro = " AND w.user_id=?"; args.push(me.id); }
  else if (pedido) { filtro = " AND w.user_id=?"; args.push(pedido); }

  const [rows] = await pool.query(
    `SELECT w.id, w.user_id, w.title, w.notes, w.file_name, w.mime_type, w.size_bytes,
            DATE_FORMAT(w.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name, up.full_name AS uploaded_by_name
       FROM contract_workplans w
       JOIN users u ON u.id=w.user_id
       LEFT JOIN users up ON up.id=w.uploaded_by
      WHERE w.contract_id=?${filtro}`,
    args
  );
  return Response.json(rows);
}

// Subir o reemplazar el cronograma de una persona.
export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;

  try {
    const fd = await req.formData();
    // Cada quien sube el suyo; quien supervisa puede subirlo por otra persona.
    const userId = rol === ROL.TRABAJADOR ? me.id : Number(fd.get("userId")) || me.id;

    const [[participa]] = await pool.query(
      "SELECT 1 AS ok FROM contract_users WHERE contract_id=? AND user_id=?", [contractId, userId]
    );
    if (!participa) return Response.json({ error: "La persona no participa en este contrato" }, { status: 400 });

    const guardado = await guardarArchivo(fd.get("file"), `cronogramas/${contractId}`, me.id);

    // El cronograma es único por persona: el nuevo reemplaza al anterior.
    const [[previo]] = await pool.query(
      "SELECT id, file_path FROM contract_workplans WHERE contract_id=? AND user_id=?", [contractId, userId]
    );
    if (previo) {
      await pool.query("DELETE FROM contract_workplans WHERE id=?", [previo.id]);
      await borrarArchivo(previo.file_path);
    }

    const [r] = await pool.query(
      `INSERT INTO contract_workplans (contract_id, user_id, title, notes, file_name, file_path, mime_type, size_bytes, uploaded_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [contractId, userId, (fd.get("title") || "").toString().trim() || null,
       (fd.get("notes") || "").toString().trim() || null,
       guardado.file_name, guardado.file_path, guardado.mime_type, guardado.size_bytes, me.id]
    );
    await auditar(pool, { me, contractId, entidad: "workplan", entidadId: r.insertId, accion: "WORKPLAN_UPLOADED", descripcion: `Cronograma cargado: ${guardado.file_name}`, req });
    return Response.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "No se pudo cargar el cronograma: " + e.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  const id = Number(new URL(req.url).searchParams.get("planId"));

  const [[plan]] = await pool.query(
    "SELECT * FROM contract_workplans WHERE id=? AND contract_id=?", [id, contractId]
  );
  if (!plan) return Response.json({ error: "Cronograma no encontrado" }, { status: 404 });
  if (rol === ROL.TRABAJADOR && Number(plan.user_id) !== Number(me.id)) {
    return Response.json({ error: "Solo puedes retirar tu propio cronograma" }, { status: 403 });
  }

  await pool.query("DELETE FROM contract_workplans WHERE id=?", [id]);
  await borrarArchivo(plan.file_path);
  await auditar(pool, { me, contractId, entidad: "workplan", entidadId: id, accion: "WORKPLAN_DELETED", descripcion: `Cronograma retirado: ${plan.file_name}` });
  return Response.json({ ok: true });
}
