import { contexto, auditar, esPropio, ROL } from "@/lib/gc/rbac";
import { guardarArchivo, borrarArchivo, FileError } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Consolida las actividades del periodo en el resumen del informe.
async function construirResumen(pool, contractId, userId, year, month) {
  const [actividades] = await pool.query(
    `SELECT a.id, a.title, a.description, a.category, a.result, a.status,
            DATE_FORMAT(a.activity_date,'%Y-%m-%d') activity_date,
            (SELECT COUNT(*) FROM contract_activity_files f WHERE f.activity_id=a.id) AS anexos
       FROM contract_activities a
      WHERE a.contract_id=? AND a.user_id=?
        AND YEAR(COALESCE(a.activity_date,a.created_at))=? AND MONTH(COALESCE(a.activity_date,a.created_at))=?
      ORDER BY COALESCE(a.activity_date,a.created_at) ASC`,
    [contractId, userId, year, month]
  );
  return {
    periodo: `${MESES[month - 1]} ${year}`,
    total: actividades.length,
    completadas: actividades.filter((a) => a.status === "approved" || a.status === "submitted").length,
    anexos: actividades.reduce((s, a) => s + Number(a.anexos || 0), 0),
    actividades,
  };
}

export async function GET(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  const url = new URL(req.url);
  const userId = rol === ROL.TRABAJADOR ? me.id : Number(url.searchParams.get("userId")) || me.id;
  if (!esPropio(rol, me, userId)) return Response.json({ error: "No puedes consultar informes de otro usuario" }, { status: 403 });

  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));

  if (year && month) {
    const [[informe]] = await pool.query(
      `SELECT m.*, u.full_name AS user_name, rv.full_name AS reviewer_name,
              DATE_FORMAT(m.submitted_at,'%Y-%m-%d %H:%i') submitted_at,
              DATE_FORMAT(m.reviewed_at,'%Y-%m-%d %H:%i') reviewed_at
         FROM contract_monthly_reports m
         JOIN users u ON u.id=m.user_id
         LEFT JOIN users rv ON rv.id=m.reviewed_by
        WHERE m.contract_id=? AND m.user_id=? AND m.year=? AND m.month=?`,
      [contractId, userId, year, month]
    );
    const resumen = await construirResumen(pool, contractId, userId, year, month);
    return Response.json({ informe: informe || null, resumen });
  }

  const [informes] = await pool.query(
    `SELECT m.id, m.user_id, m.year, m.month, m.status, m.version, m.file_name,
            DATE_FORMAT(m.submitted_at,'%Y-%m-%d %H:%i') submitted_at, u.full_name AS user_name
       FROM contract_monthly_reports m JOIN users u ON u.id=m.user_id
      WHERE m.contract_id=?${rol === ROL.TRABAJADOR ? " AND m.user_id=?" : ""}
      ORDER BY m.year DESC, m.month DESC`,
    rol === ROL.TRABAJADOR ? [contractId, me.id] : [contractId]
  );
  return Response.json({ informes });
}

// Genera el informe desde las actividades, o carga un archivo propio.
export async function POST(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;
  const url = new URL(req.url);
  const esArchivo = (req.headers.get("content-type") || "").includes("multipart/form-data");

  try {
    let year, month, userId, generado = null, archivo = null;

    if (esArchivo) {
      const fd = await req.formData();
      year = Number(fd.get("year"));
      month = Number(fd.get("month"));
      userId = rol === ROL.ADMIN && fd.get("userId") ? Number(fd.get("userId")) : me.id;
      archivo = await guardarArchivo(fd.get("file"), `informes/${contractId}`, me.id);
    } else {
      const b = await req.json().catch(() => ({}));
      year = Number(b.year);
      month = Number(b.month);
      userId = rol === ROL.ADMIN && b.user_id ? Number(b.user_id) : me.id;
    }

    if (!year || !month || month < 1 || month > 12) return Response.json({ error: "Periodo inválido" }, { status: 400 });
    if (rol === ROL.SUPERVISOR && Number(userId) !== Number(me.id)) {
      return Response.json({ error: "El supervisor aprueba informes, no los presenta por el contratista" }, { status: 403 });
    }

    const resumen = await construirResumen(pool, contractId, userId, year, month);
    if (!esArchivo && !resumen.total) {
      return Response.json({ error: "No hay actividades registradas en este periodo para generar el informe" }, { status: 400 });
    }
    if (!esArchivo) generado = JSON.stringify(resumen);

    const [[previo]] = await pool.query(
      "SELECT * FROM contract_monthly_reports WHERE contract_id=? AND user_id=? AND year=? AND month=?",
      [contractId, userId, year, month]
    );
    if (previo && ["aprobado", "en_revision"].includes(previo.status) && rol !== ROL.ADMIN) {
      return Response.json({ error: `El informe está en estado "${previo.status}" y no admite cambios` }, { status: 409 });
    }

    if (previo) {
      if (archivo && previo.file_path) await borrarArchivo(previo.file_path);
      await pool.query(
        `UPDATE contract_monthly_reports
            SET status='borrador', version=version+1, summary=COALESCE(?,summary),
                file_name=COALESCE(?,file_name), file_path=COALESCE(?,file_path),
                mime_type=COALESCE(?,mime_type), size_bytes=COALESCE(?,size_bytes)
          WHERE id=?`,
        [generado, archivo?.file_name || null, archivo?.file_path || null,
         archivo?.mime_type || null, archivo?.size_bytes || null, previo.id]
      );
      await auditar(pool, { me, contractId, entidad: "report", entidadId: previo.id, accion: "MONTHLY_REPORT_UPDATED", descripcion: `Informe ${resumen.periodo} actualizado (v${previo.version + 1})`, req });
      return Response.json({ ok: true, id: previo.id });
    }

    const [r] = await pool.query(
      `INSERT INTO contract_monthly_reports (contract_id, user_id, year, month, status, summary, file_name, file_path, mime_type, size_bytes)
       VALUES (?,?,?,?, 'borrador', ?,?,?,?,?)`,
      [contractId, userId, year, month, generado, archivo?.file_name || null,
       archivo?.file_path || null, archivo?.mime_type || null, archivo?.size_bytes || null]
    );
    await auditar(pool, { me, contractId, entidad: "report", entidadId: r.insertId, accion: "MONTHLY_REPORT_CREATED", descripcion: `Informe ${resumen.periodo} generado`, req });
    return Response.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "No se pudo procesar el informe: " + e.message }, { status: 500 });
  }
}
