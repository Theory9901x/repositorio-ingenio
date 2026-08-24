import { contexto, ROL } from "@/lib/gc/rbac";
import { generarInformeGenerico } from "@/lib/gc/exportar";

export const dynamic = "force-dynamic";

// Exporta en PDF la información filtrada de cualquier apartado del contrato.
// El filtro llega por querystring y el documento refleja exactamente eso:
// qué se filtró, las métricas del conjunto y el detalle registro a registro.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fmt = (s) => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };
const kb = (b) => (b ? `${Math.max(1, Math.round(b / 1024))} KB` : "—");

// Rango de fechas opcional sobre cualquier columna de fecha.
function rango(campo, desde, hasta, args) {
  let sql = "";
  if (desde) { sql += ` AND ${campo} >= ?`; args.push(desde); }
  if (hasta) { sql += ` AND ${campo} <= ?`; args.push(`${hasta} 23:59:59`); }
  return sql;
}

export async function GET(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, rol, contractId } = ctx;

  const q = new URL(req.url).searchParams;
  const seccion = q.get("seccion") || "completo";
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.get("desde") || "") ? q.get("desde") : null;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(q.get("hasta") || "") ? q.get("hasta") : null;
  const estado = (q.get("estado") || "").trim() || null;
  // El trabajador solo exporta lo suyo, elija lo que elija.
  const userId = rol === ROL.TRABAJADOR ? me.id : Number(q.get("userId")) || null;

  const [[contrato]] = await pool.query(
    `SELECT c.*, u.full_name AS responsible_name, e.name AS company_name
       FROM contract_routes c
       LEFT JOIN users u ON u.id=c.internal_responsible_id
       LEFT JOIN contract_companies e ON e.id=c.company_id
      WHERE c.id=?`, [contractId]
  );

  let persona = null;
  if (userId) {
    const [[p]] = await pool.query("SELECT id, full_name FROM users WHERE id=?", [userId]);
    persona = p || null;
  }

  const filtros = [];
  if (persona) filtros.push(["Filtrado por persona", persona.full_name]);
  if (desde || hasta) filtros.push(["Rango de fechas", `${desde ? fmt(desde) : "inicio"} — ${hasta ? fmt(hasta) : "hoy"}`]);
  if (estado) filtros.push(["Estado", estado]);

  const doc = {
    contrato,
    filtros,
    metricas: [],
    secciones: [],
    generadoPor: me.full_name,
    generadoEn: new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" }),
  };
  let nombreArchivo = seccion;

  /* ================= Documentos ================= */
  async function armarDocumentos() {
    const args = [contractId];
    let sql = "";
    if (q.get("carpeta")) { sql += " AND f.folder_id=?"; args.push(Number(q.get("carpeta"))); }
    if (q.get("q")) { sql += " AND (f.title LIKE ? OR f.file_name LIKE ?)"; args.push(`%${q.get("q")}%`, `%${q.get("q")}%`); }
    sql += rango("f.created_at", desde, hasta, args);
    if (rol === ROL.TRABAJADOR) { sql += " AND (f.owner_user_id IS NULL OR f.owner_user_id=?)"; args.push(me.id); }

    const [docs] = await pool.query(
      `SELECT f.title, f.file_name, f.section, f.size_bytes, DATE_FORMAT(f.created_at,'%Y-%m-%d') created_at,
              u.full_name AS uploaded_by_name, cf.name AS folder_name
         FROM contract_files f
         LEFT JOIN users u ON u.id=f.uploaded_by
         LEFT JOIN contract_document_folders cf ON cf.id=f.folder_id
        WHERE f.contract_id=?${sql}
        ORDER BY f.created_at DESC`, args
    );
    if (q.get("q")) doc.filtros.push(["Búsqueda", q.get("q")]);
    doc.metricas.push(
      { etiqueta: "Documentos", valor: docs.length },
      { etiqueta: "Tamaño total", valor: kb(docs.reduce((s, d) => s + Number(d.size_bytes || 0), 0) * 1) },
      { etiqueta: "Carpetas usadas", valor: new Set(docs.map((d) => d.folder_name).filter(Boolean)).size },
    );
    doc.secciones.push({
      titulo: "Documentos del expediente",
      columnas: [{ t: "Documento" }, { t: "Carpeta", w: 95 }, { t: "Sección", w: 75 }, { t: "Subió", w: 95 }, { t: "Fecha", w: 62 }, { t: "Tamaño", w: 52, alineacion: "right" }],
      filas: docs.map((d) => [
        { t: d.title || d.file_name, negrita: true }, d.folder_name || "Raíz", d.section || "—",
        d.uploaded_by_name || "—", fmt(d.created_at), kb(d.size_bytes),
      ]),
    });
    return `Relación de los documentos del expediente según el filtro aplicado (${docs.length} registro(s)).`;
  }

  /* ================= Solicitudes ================= */
  async function armarSolicitudes() {
    const argsSol = [contractId];
    let sqlSol = rango("r.created_at", desde, hasta, argsSol);
    if (rol === ROL.TRABAJADOR) { sqlSol += " AND (r.applies_to='all' OR r.assigned_user_id=?)"; argsSol.push(me.id); }
    else if (userId) { sqlSol += " AND (r.applies_to='all' OR r.assigned_user_id=?)"; argsSol.push(userId); }

    const [sols] = await pool.query(
      `SELECT r.id, r.name, r.section, r.required, DATE_FORMAT(r.due_date,'%Y-%m-%d') due_date,
              u.full_name AS assigned_name, r.applies_to
         FROM contract_document_requests r LEFT JOIN users u ON u.id=r.assigned_user_id
        WHERE r.contract_id=?${sqlSol} ORDER BY r.due_date IS NULL, r.due_date, r.id`, argsSol
    );
    const argsEnt = [contractId];
    let sqlEnt = "";
    if (userId) { sqlEnt += " AND s.user_id=?"; argsEnt.push(userId); }
    if (estado) { sqlEnt += " AND s.status=?"; argsEnt.push(estado); }
    sqlEnt += rango("s.created_at", desde, hasta, argsEnt);
    const [ents] = await pool.query(
      `SELECT s.request_id, s.status, s.file_name, DATE_FORMAT(s.created_at,'%Y-%m-%d') created_at,
              s.admin_observation, u.full_name AS user_name, rv.full_name AS reviewer_name, r.name AS request_name
         FROM contract_document_submissions s
         JOIN contract_document_requests r ON r.id=s.request_id
         JOIN users u ON u.id=s.user_id LEFT JOIN users rv ON rv.id=s.reviewed_by
        WHERE s.contract_id=?${sqlEnt} ORDER BY s.created_at DESC`, argsEnt
    );
    const n = (st) => ents.filter((e) => e.status === st).length;
    doc.metricas.push(
      { etiqueta: "Solicitudes", valor: sols.length },
      { etiqueta: "Entregas", valor: ents.length },
      { etiqueta: "Aprobadas", valor: n("aprobado"), color: [21, 169, 122] },
      { etiqueta: "En revisión / ajustes", valor: n("enviado") + n("requiere_ajuste") + n("rechazado"), color: [224, 147, 12] },
    );
    doc.secciones.push({
      titulo: "Solicitudes de documentos",
      columnas: [{ t: "Solicitud" }, { t: "Dirigida a", w: 105 }, { t: "Vence", w: 60 }, { t: "Obligatoria", w: 62 }],
      filas: sols.map((s) => [
        { t: s.name, negrita: true }, s.applies_to === "all" ? "Todo el contrato" : s.assigned_name || "—",
        s.due_date ? fmt(s.due_date) : "—", s.required ? "Sí" : "No",
      ]),
    }, {
      titulo: "Entregas realizadas",
      columnas: [{ t: "Solicitud" }, { t: "Entregó", w: 100 }, { t: "Archivo", w: 120 }, { t: "Fecha", w: 60 }, { t: "Estado", w: 72 }],
      filas: ents.map((e) => [
        { t: e.request_name, negrita: true }, e.user_name, e.file_name || "—", fmt(e.created_at), { estado: e.status },
      ]),
    });
    return `Solicitudes y entregas del contrato según el filtro aplicado (${sols.length} solicitud(es), ${ents.length} entrega(s)).`;
  }

  /* ================= Actividades ================= */
  async function armarActividades() {
    const year = Number(q.get("year")) || null;
    const month = Number(q.get("month")) || null;
    const args = [contractId];
    let sql = "";
    if (userId) { sql += " AND a.user_id=?"; args.push(userId); }
    if (year && month) { sql += " AND YEAR(a.activity_date)=? AND MONTH(a.activity_date)=?"; args.push(year, month); }
    if (estado) { sql += " AND a.status=?"; args.push(estado); }
    sql += rango("a.activity_date", desde, hasta, args);

    const [acts] = await pool.query(
      `SELECT a.id, a.title, a.description, a.category, a.status, a.result, a.user_observation, a.admin_comment,
              DATE_FORMAT(a.activity_date,'%Y-%m-%d') activity_date, u.full_name AS user_name
         FROM contract_activities a JOIN users u ON u.id=a.user_id
        WHERE a.contract_id=?${sql} ORDER BY a.activity_date DESC, a.id DESC`, args
    );
    const ids = acts.map((a) => a.id);
    let anexos = [];
    if (ids.length) {
      const [rows] = await pool.query(
        `SELECT activity_id, file_name, size_bytes FROM contract_activity_files WHERE activity_id IN (${ids.map(() => "?").join(",")})`, ids
      );
      anexos = rows;
    }
    const anexosDe = (id) => anexos.filter((x) => x.activity_id === id);
    if (year && month) doc.filtros.push(["Periodo", `${MESES[month - 1]} ${year}`]);
    const n = (st) => acts.filter((a) => a.status === st).length;
    doc.metricas.push(
      { etiqueta: "Actividades", valor: acts.length },
      { etiqueta: "Aprobadas", valor: n("approved"), color: [21, 169, 122] },
      { etiqueta: "Presentadas", valor: n("submitted") },
      { etiqueta: "Soportes adjuntos", valor: anexos.length },
    );
    doc.secciones.push({
      titulo: "Relación de actividades",
      columnas: [{ t: "Fecha", w: 60 }, { t: "Actividad" }, { t: "Persona", w: 95 }, { t: "Categoría", w: 80 }, { t: "Estado", w: 74 }, { t: "Anexos", w: 42, alineacion: "right" }],
      filas: acts.map((a) => [
        fmt(a.activity_date), { t: a.title, negrita: true }, a.user_name, a.category || "—", { estado: a.status }, String(anexosDe(a.id).length),
      ]),
    }, {
      titulo: "Detalle de las actividades",
      bloques: acts.map((a) => ({
        titulo: a.title,
        meta: `${fmt(a.activity_date)}   ·   ${a.user_name}   ·   ${a.category || "Sin categoría"}`,
        parrafos: [
          ["Descripción", a.description], ["Resultado", a.result],
          ["Observaciones del contratista", a.user_observation], ["Comentario de revisión", a.admin_comment],
        ],
        lista: anexosDe(a.id).map((x) => `${x.file_name} (${kb(x.size_bytes)})`),
      })),
    });
    return `Gestión de actividades según el filtro aplicado (${acts.length} registro(s)).`;
  }

  /* ================= Evidencias ================= */
  async function armarEvidencias() {
    const args = [contractId];
    let sql = "";
    if (userId) { sql += " AND ev.user_id=?"; args.push(userId); }
    if (estado) { sql += " AND ev.status=?"; args.push(estado); }
    sql += rango("ev.uploaded_at", desde, hasta, args);

    const [reqs] = await pool.query(
      "SELECT id, name, category, required, frequency FROM contract_evidence_requirements WHERE contract_id=? ORDER BY sort_order, id", [contractId]
    );
    const [evs] = await pool.query(
      `SELECT ev.requirement_id, ev.user_id, ev.period, ev.status, ev.file_name, ev.size_bytes, ev.observations,
              DATE_FORMAT(ev.uploaded_at,'%Y-%m-%d') uploaded_at, u.full_name AS user_name, v.full_name AS validated_by_name
         FROM contract_evidences ev JOIN users u ON u.id=ev.user_id LEFT JOIN users v ON v.id=ev.validated_by
        WHERE ev.contract_id=?${sql} ORDER BY ev.uploaded_at DESC`, args
    );
    const reqDe = (id) => reqs.find((r) => r.id === id);
    const n = (st) => evs.filter((e) => e.status === st).length;
    doc.metricas.push(
      { etiqueta: "Requisitos definidos", valor: reqs.length },
      { etiqueta: "Evidencias cargadas", valor: evs.length },
      { etiqueta: "Validadas", valor: n("validada"), color: [21, 169, 122] },
      { etiqueta: "Con ajustes", valor: n("rechazada") + n("requiere_ajuste"), color: [226, 68, 95] },
    );
    doc.secciones.push({
      titulo: "Evidencias cargadas",
      columnas: [{ t: "Requisito" }, { t: "Persona", w: 95 }, { t: "Periodo", w: 52 }, { t: "Archivo", w: 110 }, { t: "Fecha", w: 60 }, { t: "Estado", w: 74 }],
      filas: evs.map((e) => [
        { t: reqDe(e.requirement_id)?.name || "—", negrita: true }, e.user_name, e.period || "Única",
        e.file_name || "—", fmt(e.uploaded_at), { estado: e.status },
      ]),
    });
    const conObs = evs.filter((e) => e.observations);
    if (conObs.length) {
      doc.secciones.push({
        titulo: "Observaciones de validación",
        bloques: conObs.map((e) => ({
          titulo: `${reqDe(e.requirement_id)?.name || "Evidencia"} · ${e.user_name}`,
          meta: `${fmt(e.uploaded_at)} · ${e.validated_by_name ? `revisó ${e.validated_by_name}` : "sin validar"}`,
          parrafos: [["Observación", e.observations]],
        })),
      });
    }
    return `Checklist de evidencias según el filtro aplicado (${evs.length} evidencia(s)).`;
  }

  /* ================= Reuniones ================= */
  async function armarReuniones() {
    const args = [contractId];
    let sql = "";
    if (desde) { sql += " AND m.meeting_date >= ?"; args.push(desde); }
    if (hasta) { sql += " AND m.meeting_date <= ?"; args.push(hasta); }
    // Filtrando por persona se exportan sus mesas de trabajo.
    if (userId) { sql += " AND m.user_id=?"; args.push(userId); }
    const [reuniones] = await pool.query(
      `SELECT m.id, m.title, m.description, m.location, DATE_FORMAT(m.meeting_date,'%Y-%m-%d') meeting_date,
              u.full_name AS created_by_name
         FROM contract_meetings m LEFT JOIN users u ON u.id=m.created_by
        WHERE m.contract_id=?${sql} ORDER BY m.meeting_date DESC`, args
    );
    const ids = reuniones.map((r) => r.id);
    let archivos = [];
    if (ids.length) {
      const [rows] = await pool.query(
        `SELECT meeting_id, kind, file_name, size_bytes FROM contract_meeting_files WHERE meeting_id IN (${ids.map(() => "?").join(",")})`, ids
      );
      archivos = rows;
    }
    const de = (id, kind) => archivos.filter((a) => a.meeting_id === id && (!kind || a.kind === kind));
    const conActa = reuniones.filter((r) => de(r.id, "acta").length).length;
    const conAsis = reuniones.filter((r) => de(r.id, "asistencia").length).length;
    doc.metricas.push(
      { etiqueta: "Reuniones", valor: reuniones.length },
      { etiqueta: "Con acta", valor: conActa, color: [21, 169, 122] },
      { etiqueta: "Con asistencia", valor: conAsis, color: [21, 169, 122] },
      { etiqueta: "Soportes anexos", valor: archivos.length },
    );
    doc.secciones.push({
      titulo: "Reuniones realizadas",
      columnas: [{ t: "Fecha", w: 60 }, { t: "Asunto" }, { t: "Lugar", w: 90 }, { t: "Acta", w: 46 }, { t: "Asistencia", w: 58 }, { t: "Anexos", w: 44, alineacion: "right" }],
      filas: reuniones.map((r) => [
        fmt(r.meeting_date), { t: r.title, negrita: true }, r.location || "—",
        { t: de(r.id, "acta").length ? "Sí" : "No", negrita: true, color: de(r.id, "acta").length ? [21, 169, 122] : [226, 68, 95] },
        { t: de(r.id, "asistencia").length ? "Sí" : "No", negrita: true, color: de(r.id, "asistencia").length ? [21, 169, 122] : [226, 68, 95] },
        String(de(r.id, "anexo").length),
      ]),
    }, {
      titulo: "Detalle de las reuniones",
      bloques: reuniones.map((r) => ({
        titulo: r.title,
        meta: `${fmt(r.meeting_date)}${r.location ? ` · ${r.location}` : ""} · creada por ${r.created_by_name || "—"}`,
        parrafos: [["Descripción", r.description]],
        lista: de(r.id).map((a) => `${a.kind === "acta" ? "Acta" : a.kind === "asistencia" ? "Asistencia" : "Anexo"}: ${a.file_name} (${kb(a.size_bytes)})`),
      })),
    });
    return `Reuniones del contrato según el filtro aplicado (${reuniones.length} reunión(es)).`;
  }

  /* ================= Contratistas ================= */
  async function armarContratistas() {
    const [rows] = await pool.query(
      `SELECT cu.role_in_contract, cu.specialty, cu.status,
              DATE_FORMAT(cu.start_date,'%Y-%m-%d') start_date, DATE_FORMAT(cu.end_date,'%Y-%m-%d') end_date,
              u.full_name, u.cargo,
              (SELECT COUNT(*) FROM contract_activities a WHERE a.contract_id=cu.contract_id AND a.user_id=cu.user_id) AS actividades,
              (SELECT COUNT(*) FROM contract_evidences ev WHERE ev.contract_id=cu.contract_id AND ev.user_id=cu.user_id AND ev.status='validada') AS validadas,
              (SELECT COUNT(*) FROM contract_document_submissions s WHERE s.contract_id=cu.contract_id AND s.user_id=cu.user_id) AS entregas
         FROM contract_users cu JOIN users u ON u.id=cu.user_id
        WHERE cu.contract_id=? ORDER BY cu.role_in_contract='supervisor' DESC, u.full_name`, [contractId]
    );
    doc.metricas.push(
      { etiqueta: "Participantes", valor: rows.length },
      { etiqueta: "Activos", valor: rows.filter((r) => r.status === "activo").length, color: [21, 169, 122] },
      { etiqueta: "Actividades totales", valor: rows.reduce((s, r) => s + Number(r.actividades), 0) },
      { etiqueta: "Evidencias validadas", valor: rows.reduce((s, r) => s + Number(r.validadas), 0) },
    );
    doc.secciones.push({
      titulo: "Equipo del contrato",
      columnas: [{ t: "Persona" }, { t: "Rol", w: 78 }, { t: "Especialidad", w: 105 }, { t: "Vinculación", w: 88 }, { t: "Activ.", w: 40, alineacion: "right" }, { t: "Evid.", w: 36, alineacion: "right" }, { t: "Entregas", w: 48, alineacion: "right" }],
      filas: rows.map((r) => [
        { t: r.full_name, negrita: true }, r.role_in_contract, r.specialty || r.cargo || "—",
        r.start_date ? `${fmt(r.start_date)} — ${r.end_date ? fmt(r.end_date) : "…"}` : "—",
        String(r.actividades), String(r.validadas), String(r.entregas),
      ]),
    });
    return `Equipo del contrato y su gestión (${rows.length} participante(s)).`;
  }

  /* ================= Historial ================= */
  async function armarHistorial() {
    const vista = q.get("vista") === "auditoria" && rol !== ROL.TRABAJADOR ? "auditoria" : "eventos";
    const tipo = (q.get("tipo") || "").trim() || null;
    if (tipo) doc.filtros.push(["Tipo de acción", tipo]);
    doc.filtros.push(["Vista", vista === "auditoria" ? "Auditoría detallada" : "Eventos"]);

    let filas;
    if (vista === "auditoria") {
      const args = [contractId];
      let sql = rango("a.created_at", desde, hasta, args);
      if (tipo) { sql += " AND a.action LIKE ?"; args.push(`%${tipo}%`); }
      const [rows] = await pool.query(
        `SELECT a.action, a.description, DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i') created_at, u.full_name AS actor_name
           FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
          WHERE a.contract_id=?${sql} ORDER BY a.created_at DESC LIMIT 400`, args
      );
      filas = rows.map((r) => [r.created_at, { t: r.action, negrita: true }, r.actor_name || "Sistema", r.description || "—"]);
    } else {
      const args = [contractId];
      let sql = rango("e.created_at", desde, hasta, args);
      if (tipo) { sql += " AND e.event_type LIKE ?"; args.push(`%${tipo}%`); }
      if (rol === ROL.TRABAJADOR) { sql += " AND e.actor_user_id=?"; args.push(me.id); }
      const [rows] = await pool.query(
        `SELECT e.event_type, e.description, DATE_FORMAT(e.created_at,'%Y-%m-%d %H:%i') created_at, u.full_name AS actor_name
           FROM contract_events e LEFT JOIN users u ON u.id=e.actor_user_id
          WHERE e.contract_id=?${sql} ORDER BY e.created_at DESC LIMIT 400`, args
      );
      filas = rows.map((r) => [r.created_at, { t: r.event_type, negrita: true }, r.actor_name || "Sistema", r.description || "—"]);
    }
    const personas = new Set(filas.map((f) => f[2]));
    doc.metricas.push(
      { etiqueta: "Acciones registradas", valor: filas.length },
      { etiqueta: "Personas involucradas", valor: personas.size },
      { etiqueta: "Tipos de acción", valor: new Set(filas.map((f) => f[1].t)).size },
    );
    doc.secciones.push({
      titulo: "Trazabilidad de la gestión",
      columnas: [{ t: "Fecha y hora", w: 82 }, { t: "Acción", w: 132 }, { t: "Quién", w: 92 }, { t: "Descripción" }],
      filas,
    });
    return `Registro cronológico de la gestión según el filtro aplicado (${filas.length} acción(es)).`;
  }

  /* ================= Por usuario ================= */
  // Toda la gestión del contrato discriminada persona por persona: cada
  // participante aparece con sus métricas y el detalle de lo suyo.
  async function armarPorUsuario() {
    let [equipo] = await pool.query(
      `SELECT cu.user_id, cu.role_in_contract, cu.specialty, cu.status, u.full_name, u.cargo
         FROM contract_users cu JOIN users u ON u.id=cu.user_id
        WHERE cu.contract_id=? ORDER BY cu.role_in_contract='supervisor' DESC, u.full_name`,
      [contractId]
    );
    // Con filtro de persona (o siendo trabajador) solo va esa persona.
    if (userId) equipo = equipo.filter((p) => Number(p.user_id) === Number(userId));

    doc.metricas.push({ etiqueta: "Personas incluidas", valor: equipo.length });

    for (const p of equipo) {
      const uid = p.user_id;
      const [entregas] = await pool.query(
        `SELECT r.name AS request_name, s.status, s.file_name, DATE_FORMAT(s.created_at,'%Y-%m-%d') created_at
           FROM contract_document_submissions s JOIN contract_document_requests r ON r.id=s.request_id
          WHERE s.contract_id=? AND s.user_id=? ORDER BY s.created_at DESC`, [contractId, uid]
      );
      const [acts] = await pool.query(
        `SELECT title, category, status, DATE_FORMAT(activity_date,'%Y-%m-%d') activity_date,
                (SELECT COUNT(*) FROM contract_activity_files f WHERE f.activity_id=contract_activities.id) AS anexos
           FROM contract_activities WHERE contract_id=? AND user_id=? ORDER BY activity_date DESC`, [contractId, uid]
      );
      const [evs] = await pool.query(
        `SELECT er.name, ev.period, ev.status, ev.file_name, DATE_FORMAT(ev.uploaded_at,'%Y-%m-%d') uploaded_at
           FROM contract_evidences ev JOIN contract_evidence_requirements er ON er.id=ev.requirement_id
          WHERE ev.contract_id=? AND ev.user_id=? ORDER BY ev.uploaded_at DESC`, [contractId, uid]
      );
      const [mesas] = await pool.query(
        `SELECT m.title, m.location, DATE_FORMAT(m.meeting_date,'%Y-%m-%d') meeting_date,
                SUM(f.kind='acta') AS actas, SUM(f.kind='asistencia') AS asistencias,
                SUM(f.kind='foto') AS fotos, SUM(f.kind='anexo') AS anexos
           FROM contract_meetings m LEFT JOIN contract_meeting_files f ON f.meeting_id=m.id
          WHERE m.contract_id=? AND m.user_id=? GROUP BY m.id ORDER BY m.meeting_date DESC`, [contractId, uid]
      );
      const [[plan]] = await pool.query(
        "SELECT file_name, DATE_FORMAT(created_at,'%Y-%m-%d') created_at FROM contract_workplans WHERE contract_id=? AND user_id=?",
        [contractId, uid]
      );

      const aprobadas = acts.filter((a) => a.status === "approved").length;
      const validadas = evs.filter((e) => e.status === "validada").length;

      // Ficha resumen de la persona.
      doc.secciones.push({
        titulo: `${p.full_name} — ${p.role_in_contract || "Contratista"}`,
        bloques: [{
          titulo: "Resumen de su gestión",
          meta: `${p.specialty || p.cargo || "Sin especialidad"} · estado ${p.status || "activo"}`,
          parrafos: [
            ["Cronograma de trabajo", plan ? `${plan.file_name} (cargado el ${fmt(plan.created_at)})` : "Sin cargar"],
            ["Balance", `${entregas.length} entrega(s) de documentos · ${acts.length} actividad(es), ${aprobadas} aprobada(s) · ${evs.length} evidencia(s), ${validadas} validada(s) · ${mesas.length} mesa(s) de trabajo`],
          ],
        }],
      });

      if (entregas.length) doc.secciones.push({
        titulo: `Entregas de documentos · ${p.full_name}`,
        columnas: [{ t: "Solicitud" }, { t: "Archivo", w: 130 }, { t: "Fecha", w: 60 }, { t: "Estado", w: 74 }],
        filas: entregas.map((e) => [{ t: e.request_name, negrita: true }, e.file_name || "—", fmt(e.created_at), { estado: e.status }]),
      });
      if (acts.length) doc.secciones.push({
        titulo: `Actividades · ${p.full_name}`,
        columnas: [{ t: "Fecha", w: 60 }, { t: "Actividad" }, { t: "Categoría", w: 85 }, { t: "Estado", w: 74 }, { t: "Anexos", w: 42, alineacion: "right" }],
        filas: acts.map((a) => [fmt(a.activity_date), { t: a.title, negrita: true }, a.category || "—", { estado: a.status }, String(a.anexos)]),
      });
      if (evs.length) doc.secciones.push({
        titulo: `Evidencias · ${p.full_name}`,
        columnas: [{ t: "Requisito" }, { t: "Periodo", w: 52 }, { t: "Archivo", w: 120 }, { t: "Fecha", w: 60 }, { t: "Estado", w: 74 }],
        filas: evs.map((e) => [{ t: e.name, negrita: true }, e.period || "Única", e.file_name || "—", fmt(e.uploaded_at), { estado: e.status }]),
      });
      if (mesas.length) doc.secciones.push({
        titulo: `Mesas de trabajo · ${p.full_name}`,
        columnas: [{ t: "Fecha", w: 60 }, { t: "Tema" }, { t: "Lugar", w: 90 }, { t: "Acta", w: 40 }, { t: "Asist.", w: 40 }, { t: "Fotos", w: 40, alineacion: "right" }],
        filas: mesas.map((m) => [
          fmt(m.meeting_date), { t: m.title, negrita: true }, m.location || "—",
          { t: Number(m.actas) ? "Sí" : "No", negrita: true, color: Number(m.actas) ? [21, 169, 122] : [226, 68, 95] },
          { t: Number(m.asistencias) ? "Sí" : "No", negrita: true, color: Number(m.asistencias) ? [21, 169, 122] : [226, 68, 95] },
          String(Number(m.fotos) || 0),
        ]),
      });
    }
    return userId
      ? `Gestión completa de ${equipo[0]?.full_name || "la persona"} en el contrato.`
      : `Toda la gestión del contrato discriminada por persona (${equipo.length} participante(s)).`;
  }

  /* ================= Armado ================= */
  const ARMADORES = {
    documentos: ["Informe de documentos", armarDocumentos],
    solicitudes: ["Informe de solicitudes y entregas", armarSolicitudes],
    actividades: ["Informe de actividades", armarActividades],
    evidencias: ["Informe de evidencias", armarEvidencias],
    reuniones: ["Informe de reuniones", armarReuniones],
    contratistas: ["Informe del equipo del contrato", armarContratistas],
    historial: ["Informe de trazabilidad", armarHistorial],
    "por-usuario": ["Informe de gestión por usuario", armarPorUsuario],
  };

  try {
    if (seccion === "completo") {
      doc.titulo = "Informe integral del contrato";
      nombreArchivo = "informe-integral";
      const partes = [];
      for (const [clave, [, armar]] of Object.entries(ARMADORES)) {
        if (clave === "historial" && rol === ROL.TRABAJADOR) continue;
        partes.push(await armar());
      }
      await armarPorUsuario();
      doc.subtitulo = "Consolidado de toda la gestión registrada en el contrato: expediente, solicitudes, actividades, evidencias, reuniones, equipo, trazabilidad y el detalle discriminado por persona.";
    } else if (ARMADORES[seccion]) {
      const [tituloSeccion, armar] = ARMADORES[seccion];
      doc.titulo = tituloSeccion;
      doc.subtitulo = await armar();
    } else {
      return Response.json({ error: "Apartado no reconocido" }, { status: 400 });
    }

    const buffer = generarInformeGenerico(doc);
    const fechaArchivo = new Date().toISOString().slice(0, 10);
    const nombre = `${nombreArchivo}-${(contrato.code || `contrato-${contractId}`).replace(/[^a-zA-Z0-9-]+/g, "_")}-${fechaArchivo}.pdf`;
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json({ error: "No se pudo generar el informe: " + e.message }, { status: 500 });
  }
}
