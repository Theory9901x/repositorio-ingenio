import { contexto, auditar, ROL } from "@/lib/gc/rbac";
import { guardarArchivo, borrarArchivo, FileError } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

const SECCIONES = ["contratacion", "cronograma", "plan_trabajo", "acta", "formato", "soporte", "cuenta_cobro", "ejecucion", "evidencia"];

export async function GET(_req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;

  // El trabajador ve los documentos generales y los suyos, nunca los de otros.
  const filtro = rol === ROL.TRABAJADOR ? " AND (f.visibility='general' OR f.owner_user_id=?)" : "";
  const args = rol === ROL.TRABAJADOR ? [contractId, me.id] : [contractId];

  const [rows] = await pool.query(
    `SELECT f.id, f.contract_id, f.section, f.folder_id, f.title, f.description, f.file_name, f.mime_type,
            f.size_bytes, f.visibility, f.owner_user_id, f.uploaded_by,
            DATE_FORMAT(f.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name AS uploaded_by_name, o.full_name AS owner_name
       FROM contract_files f
       LEFT JOIN users u ON u.id=f.uploaded_by
       LEFT JOIN users o ON o.id=f.owner_user_id
      WHERE f.contract_id=?${filtro}
      ORDER BY f.created_at DESC`,
    args
  );
  return Response.json(rows);
}

export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "DOCUMENT_UPLOAD");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;

  try {
    const fd = await req.formData();
    const section = SECCIONES.includes(fd.get("section")) ? fd.get("section") : "soporte";
    const title = (fd.get("title") || "").toString().trim();

    // Un trabajador solo sube documentos a su propio nombre.
    let ownerUserId = fd.get("ownerUserId") ? Number(fd.get("ownerUserId")) : null;
    let visibility = (fd.get("visibility") || "general").toString();
    if (rol === ROL.TRABAJADOR) {
      ownerUserId = me.id;
      visibility = "user_evidence";
    }

    const folderId = fd.get("folderId") ? Number(fd.get("folderId")) : null;
    if (folderId) {
      const [[carpeta]] = await pool.query("SELECT id FROM contract_document_folders WHERE id=? AND contract_id=?", [folderId, contractId]);
      if (!carpeta) return Response.json({ error: "La carpeta indicada no existe" }, { status: 400 });
    }

    const guardado = await guardarArchivo(fd.get("file"), `documentos/${contractId}`, me.id);
    const [r] = await pool.query(
      `INSERT INTO contract_files (contract_id, uploaded_by, section, folder_id, title, description, file_name, file_path, mime_type, size_bytes, visibility, owner_user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [contractId, me.id, section, folderId, title || guardado.file_name, (fd.get("description") || "").toString() || null,
       guardado.file_name, guardado.file_path, guardado.mime_type, guardado.size_bytes, visibility, ownerUserId]
    );
    await auditar(pool, { me, contractId, entidad: "document", entidadId: r.insertId, accion: "FILE_UPLOADED", descripcion: `Documento cargado: ${title || guardado.file_name}`, req });
    return Response.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "No se pudo cargar el documento: " + e.message }, { status: 500 });
  }
}

// Mover un documento a otra carpeta.
export async function PUT(req, { params }) {
  const ctx = await contexto(params.id, "DOCUMENT_UPLOAD");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const b = await req.json().catch(() => ({}));
  const docId = Number(b.docId);
  const folderId = b.folder_id ? Number(b.folder_id) : null;
  if (!docId) return Response.json({ error: "Documento no indicado" }, { status: 400 });

  if (folderId) {
    const [[carpeta]] = await pool.query(
      "SELECT id FROM contract_document_folders WHERE id=? AND contract_id=?", [folderId, contractId]);
    if (!carpeta) return Response.json({ error: "La carpeta indicada no existe" }, { status: 400 });
  }
  const [r] = await pool.query(
    "UPDATE contract_files SET folder_id=? WHERE id=? AND contract_id=?", [folderId, docId, contractId]);
  if (!r.affectedRows) return Response.json({ error: "Documento no encontrado" }, { status: 404 });

  await auditar(pool, { me, contractId, entidad: "document", entidadId: docId, accion: "FILE_MOVED", descripcion: "Documento movido de carpeta" });
  return Response.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  const docId = Number(new URL(req.url).searchParams.get("docId"));
  if (!docId) return Response.json({ error: "Documento no indicado" }, { status: 400 });

  const [[doc]] = await pool.query("SELECT * FROM contract_files WHERE id=? AND contract_id=?", [docId, contractId]);
  if (!doc) return Response.json({ error: "Documento no encontrado" }, { status: 404 });

  const propio = Number(doc.uploaded_by) === Number(me.id);
  if (rol === ROL.TRABAJADOR && !propio) {
    return Response.json({ error: "Solo puedes eliminar documentos que tú cargaste" }, { status: 403 });
  }

  await pool.query("DELETE FROM contract_files WHERE id=?", [docId]);
  await borrarArchivo(doc.file_path);
  await auditar(pool, { me, contractId, entidad: "document", entidadId: docId, accion: "FILE_DELETED", descripcion: `Documento eliminado: ${doc.title}` });
  return Response.json({ ok: true });
}
