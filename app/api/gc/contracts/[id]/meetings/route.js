import { contexto, auditar, ROL } from "@/lib/gc/rbac";
import { guardarArchivo, borrarArchivo, FileError } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

const TIPOS_ANEXO = new Set(["acta", "asistencia", "anexo"]);

// Reuniones del contrato: cada una es una carpeta fechada con su acta,
// su lista de asistencia y los demás soportes.
export async function GET(_req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, contractId } = ctx;

  const [reuniones] = await pool.query(
    `SELECT m.id, m.title, m.description, m.location,
            DATE_FORMAT(m.meeting_date,'%Y-%m-%d') meeting_date,
            DATE_FORMAT(m.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name AS created_by_name
       FROM contract_meetings m
       LEFT JOIN users u ON u.id=m.created_by
      WHERE m.contract_id=?
      ORDER BY m.meeting_date DESC, m.id DESC`,
    [contractId]
  );

  // Los archivos de todas las reuniones, en una sola consulta.
  const [archivos] = await pool.query(
    `SELECT f.id, f.meeting_id, f.kind, f.file_name, f.mime_type, f.size_bytes,
            DATE_FORMAT(f.created_at,'%Y-%m-%d %H:%i') created_at,
            u.full_name AS uploaded_by_name, f.uploaded_by
       FROM contract_meeting_files f
       LEFT JOIN users u ON u.id=f.uploaded_by
      WHERE f.contract_id=?
      ORDER BY f.created_at DESC`,
    [contractId]
  );
  const porReunion = {};
  for (const a of archivos) (porReunion[a.meeting_id] ||= []).push(a);
  reuniones.forEach((r) => { r.archivos = porReunion[r.id] || []; });

  return Response.json(reuniones);
}

// Crear una reunión.
export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "DOCUMENT_UPLOAD");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;
  const b = await req.json().catch(() => ({}));

  const title = (b.title || "").toString().trim();
  const fecha = (b.meeting_date || "").toString().trim();
  if (!title) return Response.json({ error: "Indica el asunto de la reunión" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return Response.json({ error: "Indica la fecha de la reunión" }, { status: 400 });

  const [r] = await pool.query(
    "INSERT INTO contract_meetings (contract_id, meeting_date, title, description, location, created_by) VALUES (?,?,?,?,?,?)",
    [contractId, fecha, title, (b.description || "").toString().trim() || null,
     (b.location || "").toString().trim() || null, me.id]
  );
  await auditar(pool, { me, contractId, entidad: "meeting", entidadId: r.insertId, accion: "MEETING_CREATED", descripcion: `Reunión creada: ${title} (${fecha})`, req });
  return Response.json({ ok: true, id: r.insertId });
}

// Anexar el acta, la asistencia u otro soporte a una reunión.
export async function PUT(req, { params }) {
  const ctx = await contexto(params.id, "DOCUMENT_UPLOAD");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;

  try {
    const fd = await req.formData();
    const meetingId = Number(fd.get("meetingId"));
    const kind = TIPOS_ANEXO.has(fd.get("kind")) ? fd.get("kind") : "anexo";
    if (!meetingId) return Response.json({ error: "Reunión no indicada" }, { status: 400 });

    const [[reunion]] = await pool.query(
      "SELECT id, title FROM contract_meetings WHERE id=? AND contract_id=?", [meetingId, contractId]
    );
    if (!reunion) return Response.json({ error: "La reunión no existe" }, { status: 404 });

    const guardado = await guardarArchivo(fd.get("file"), `reuniones/${contractId}`, me.id);

    // Acta y asistencia son únicas por reunión: la nueva reemplaza la anterior.
    if (kind !== "anexo") {
      const [previas] = await pool.query(
        "SELECT id, file_path FROM contract_meeting_files WHERE meeting_id=? AND kind=?", [meetingId, kind]
      );
      for (const p of previas) {
        await pool.query("DELETE FROM contract_meeting_files WHERE id=?", [p.id]);
        await borrarArchivo(p.file_path);
      }
    }

    const [r] = await pool.query(
      "INSERT INTO contract_meeting_files (meeting_id, contract_id, kind, file_name, file_path, mime_type, size_bytes, uploaded_by) VALUES (?,?,?,?,?,?,?,?)",
      [meetingId, contractId, kind, guardado.file_name, guardado.file_path, guardado.mime_type, guardado.size_bytes, me.id]
    );
    await auditar(pool, { me, contractId, entidad: "meeting", entidadId: meetingId, accion: "MEETING_FILE_ADDED", descripcion: `${kind === "acta" ? "Acta" : kind === "asistencia" ? "Asistencia" : "Anexo"} de la reunión «${reunion.title}»: ${guardado.file_name}`, req });
    return Response.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "No se pudo anexar el archivo: " + e.message }, { status: 500 });
  }
}

// Eliminar una reunión completa o un archivo suelto.
export async function DELETE(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  const url = new URL(req.url);
  const meetingId = Number(url.searchParams.get("meetingId"));
  const fileId = Number(url.searchParams.get("fileId"));

  // Un archivo suelto: lo borra quien lo subió o quien supervisa.
  if (fileId) {
    const [[archivo]] = await pool.query(
      "SELECT * FROM contract_meeting_files WHERE id=? AND contract_id=?", [fileId, contractId]
    );
    if (!archivo) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
    const propio = Number(archivo.uploaded_by) === Number(me.id);
    if (rol === ROL.TRABAJADOR && !propio) {
      return Response.json({ error: "Solo puedes retirar los archivos que subiste tú" }, { status: 403 });
    }
    await pool.query("DELETE FROM contract_meeting_files WHERE id=?", [fileId]);
    await borrarArchivo(archivo.file_path);
    await auditar(pool, { me, contractId, entidad: "meeting", entidadId: archivo.meeting_id, accion: "MEETING_FILE_DELETED", descripcion: `Archivo retirado de la reunión: ${archivo.file_name}` });
    return Response.json({ ok: true });
  }

  // La reunión entera: solo quien supervisa o administra.
  if (!meetingId) return Response.json({ error: "Reunión no indicada" }, { status: 400 });
  if (rol === ROL.TRABAJADOR) {
    return Response.json({ error: "No tienes permiso para eliminar reuniones" }, { status: 403 });
  }
  const [[reunion]] = await pool.query(
    "SELECT id, title FROM contract_meetings WHERE id=? AND contract_id=?", [meetingId, contractId]
  );
  if (!reunion) return Response.json({ error: "La reunión no existe" }, { status: 404 });

  const [archivos] = await pool.query("SELECT file_path FROM contract_meeting_files WHERE meeting_id=?", [meetingId]);
  await pool.query("DELETE FROM contract_meeting_files WHERE meeting_id=?", [meetingId]);
  await pool.query("DELETE FROM contract_meetings WHERE id=?", [meetingId]);
  for (const a of archivos) await borrarArchivo(a.file_path);
  await auditar(pool, { me, contractId, entidad: "meeting", entidadId: meetingId, accion: "MEETING_DELETED", descripcion: `Reunión eliminada: ${reunion.title}` });
  return Response.json({ ok: true });
}
