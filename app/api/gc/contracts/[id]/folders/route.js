import { contexto, auditar, ROL } from "@/lib/gc/rbac";

export const dynamic = "force-dynamic";

// Carpetas y subcarpetas de los documentos del contrato.
export async function GET(_req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, contractId } = ctx;
  const [rows] = await pool.query(
    `SELECT f.id, f.parent_id, f.name, f.description,
            DATE_FORMAT(f.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name AS created_by_name,
            (SELECT COUNT(*) FROM contract_files cf WHERE cf.folder_id=f.id) AS documentos
       FROM contract_document_folders f
       LEFT JOIN users u ON u.id=f.created_by
      WHERE f.contract_id=? ORDER BY f.parent_id IS NOT NULL, f.name`,
    [contractId]
  );
  return Response.json(rows);
}

export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "DOCUMENT_UPLOAD");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const b = await req.json().catch(() => ({}));
  const name = (b.name || "").toString().trim();
  if (!name) return Response.json({ error: "El nombre de la carpeta es obligatorio" }, { status: 400 });

  const parentId = b.parent_id ? Number(b.parent_id) : null;
  if (parentId) {
    const [[padre]] = await pool.query(
      "SELECT id FROM contract_document_folders WHERE id=? AND contract_id=?", [parentId, contractId]);
    if (!padre) return Response.json({ error: "La carpeta contenedora no existe" }, { status: 400 });
  }

  const [[dup]] = await pool.query(
    `SELECT id FROM contract_document_folders
      WHERE contract_id=? AND name=? AND ${parentId ? "parent_id=?" : "parent_id IS NULL"}`,
    parentId ? [contractId, name, parentId] : [contractId, name]
  );
  if (dup) return Response.json({ error: "Ya existe una carpeta con ese nombre en este nivel" }, { status: 409 });

  const [r] = await pool.query(
    "INSERT INTO contract_document_folders (contract_id, parent_id, name, description, created_by) VALUES (?,?,?,?,?)",
    [contractId, parentId, name, (b.description || "").toString().trim() || null, me.id]
  );
  await auditar(pool, { me, contractId, entidad: "folder", entidadId: r.insertId, accion: "FOLDER_CREATED", descripcion: `Carpeta creada: ${name}`, req });
  return Response.json({ ok: true, id: r.insertId });
}

export async function PUT(req, { params }) {
  const ctx = await contexto(params.id, "DOCUMENT_UPLOAD");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const name = (b.name || "").toString().trim();
  if (!id || !name) return Response.json({ error: "Datos inválidos" }, { status: 400 });

  const [r] = await pool.query(
    "UPDATE contract_document_folders SET name=?, description=? WHERE id=? AND contract_id=?",
    [name, (b.description || "").toString().trim() || null, id, contractId]
  );
  if (!r.affectedRows) return Response.json({ error: "Carpeta no encontrada" }, { status: 404 });
  await auditar(pool, { me, contractId, entidad: "folder", entidadId: id, accion: "FOLDER_UPDATED", descripcion: `Carpeta renombrada: ${name}` });
  return Response.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const ctx = await contexto(params.id, "DOCUMENT_UPLOAD");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  if (rol === ROL.TRABAJADOR) return Response.json({ error: "No puedes eliminar carpetas del contrato" }, { status: 403 });

  const id = Number(new URL(req.url).searchParams.get("folderId"));
  const [[carpeta]] = await pool.query(
    "SELECT name FROM contract_document_folders WHERE id=? AND contract_id=?", [id, contractId]);
  if (!carpeta) return Response.json({ error: "Carpeta no encontrada" }, { status: 404 });

  // Una carpeta con contenido no se borra: primero hay que vaciarla, para no
  // arrastrar documentos sin que nadie lo note.
  const [[uso]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM contract_files WHERE folder_id=?) AS documentos,
            (SELECT COUNT(*) FROM contract_document_folders WHERE parent_id=?) AS subcarpetas`,
    [id, id]
  );
  if (uso.documentos || uso.subcarpetas) {
    const partes = [];
    if (uso.subcarpetas) partes.push(`${uso.subcarpetas} subcarpeta(s)`);
    if (uso.documentos) partes.push(`${uso.documentos} documento(s)`);
    return Response.json({ error: `La carpeta contiene ${partes.join(" y ")}. Vacíala antes de eliminarla.` }, { status: 409 });
  }

  await pool.query("DELETE FROM contract_document_folders WHERE id=? AND contract_id=?", [id, contractId]);
  await auditar(pool, { me, contractId, entidad: "folder", entidadId: id, accion: "FOLDER_DELETED", descripcion: `Carpeta eliminada: ${carpeta.name}` });
  return Response.json({ ok: true });
}
