// Puebla el contrato DEMO de la Alcaldía con una gestión completa de ejemplo
// (documentos, solicitudes con entregas, actividades y evidencias) a nombre de
// un usuario real, para poder mostrar el ciclo entero en una demostración.
//
//   node scripts/demo-alcaldia.mjs           → informa qué haría
//   node scripts/demo-alcaldia.mjs aplicar   → escribe los datos
//
// Es idempotente: usa títulos fijos y no duplica lo que ya exista.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const APLICAR = process.argv.includes("aplicar");
const USUARIO = "natalia.forero"; // la protagonista de la demo
const UPLOAD_ROOT = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";

const env = await fs.readFile(".env", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const u = new URL(url);
const db = await mysql.createConnection({
  host: u.hostname, port: u.port || 3306,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1), charset: "utf8mb4",
});

// --- PDF mínimo pero válido, con título y unas líneas de texto --------------
function pdfSimple(titulo, lineas) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => "\\" + c).replace(/[^\x20-\x7E]/g, "");
  let texto = `BT /F1 16 Tf 60 770 Td (${esc(titulo)}) Tj ET\n`;
  lineas.forEach((l, i) => {
    texto += `BT /F1 10 Tf 60 ${735 - i * 16} Td (${esc(l)}) Tj ET\n`;
  });
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${texto.length} >>\nstream\n${texto}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objetos.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

async function guardarPdf(subcarpeta, nombre, titulo, lineas, userId) {
  const dir = path.join(UPLOAD_ROOT, "contratos", subcarpeta);
  await fs.mkdir(dir, { recursive: true });
  const stored = `${userId}-${crypto.randomUUID()}.pdf`;
  const buffer = pdfSimple(titulo, lineas);
  await fs.writeFile(path.join(dir, stored), buffer);
  return {
    file_name: nombre,
    file_path: path.posix.join("contratos", subcarpeta, stored),
    mime_type: "application/pdf",
    size_bytes: buffer.length,
  };
}

// --- Protagonistas ----------------------------------------------------------
const [[contrato]] = await db.query(
  "SELECT id, title FROM contract_routes WHERE title LIKE '%DEMO%' OR entity_name LIKE '%DEMO%' OR entity_name LIKE '%Alcald%' ORDER BY id DESC LIMIT 1"
);
const [[persona]] = await db.query("SELECT id, full_name FROM users WHERE username=?", [USUARIO]);
const [[admin]] = await db.query("SELECT id, full_name FROM users WHERE role='admin' AND is_active=1 ORDER BY id LIMIT 1");

console.log("Contrato demo:", contrato ? `#${contrato.id} ${contrato.title}` : "NO ENCONTRADO");
console.log("Usuaria:", persona ? `#${persona.id} ${persona.full_name}` : "NO ENCONTRADA");
console.log("Revisa:", admin ? `#${admin.id} ${admin.full_name}` : "NO HAY ADMIN");
if (!contrato || !persona || !admin) { await db.end(); process.exit(1); }
if (!APLICAR) { console.log("\n(informe: ejecuta con `aplicar` para escribir la demo)"); await db.end(); process.exit(0); }

const C = contrato.id, P = persona.id, A = admin.id;
const hoy = new Date();
const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

// La persona participa en el contrato.
await db.query(
  `INSERT INTO contract_users (contract_id, user_id, role_in_contract, specialty, status, assigned_by)
   VALUES (?,?, 'contratista', 'Profesional de apoyo a la gestión', 'activo', ?)
   ON DUPLICATE KEY UPDATE status='activo'`, [C, P, A]);
await db.query("INSERT IGNORE INTO contract_members (contract_id, user_id) VALUES (?,?)", [C, P]);

// --- Documentos del expediente ---------------------------------------------
const DOCS = [
  ["Acta de inicio", "precontractual", "Acta de inicio suscrita entre las partes."],
  ["Cronograma de trabajo", "ejecucion", "Cronograma aprobado para la vigencia."],
];
for (const [titulo, seccion, descripcion] of DOCS) {
  const [[ya]] = await db.query("SELECT id FROM contract_files WHERE contract_id=? AND title=?", [C, titulo]);
  if (ya) continue;
  const g = await guardarPdf(`demo/${C}`, `${titulo}.pdf`, titulo,
    ["Contrato DEMO - Alcaldia de Yopal", descripcion, "Documento generado para la demostracion."], A);
  await db.query(
    `INSERT INTO contract_files (contract_id, uploaded_by, section, title, description, file_name, file_path, mime_type, size_bytes, visibility, owner_user_id)
     VALUES (?,?,?,?,?,?,?,?,?, 'all', NULL)`,
    [C, A, seccion, titulo, descripcion, g.file_name, g.file_path, g.mime_type, g.size_bytes]);
  console.log("Documento:", titulo);
}

// --- Solicitud de documentos con entrega aprobada y otra en revisión --------
const SOLICITUDES = [
  ["Hoja de vida actualizada", "aprobado", "Documento completo. Aprobado para el expediente."],
  ["Informe parcial de actividades", "enviado", null],
];
for (const [nombre, estadoEntrega, observacion] of SOLICITUDES) {
  let [[req]] = await db.query("SELECT id FROM contract_document_requests WHERE contract_id=? AND name=?", [C, nombre]);
  if (!req) {
    const [r] = await db.query(
      `INSERT INTO contract_document_requests (contract_id, name, description, section, required, applies_to, assigned_user_id, created_by)
       VALUES (?,?,?, 'soporte', 1, 'user', ?, ?)`,
      [C, nombre, `Se solicita: ${nombre.toLowerCase()}.`, P, A]);
    req = { id: r.insertId };
    console.log("Solicitud:", nombre);
  }
  const [[entrega]] = await db.query("SELECT id FROM contract_document_submissions WHERE request_id=? AND user_id=?", [req.id, P]);
  if (!entrega) {
    const g = await guardarPdf(`entregas/${C}`, `${nombre}.pdf`, nombre,
      [`Entregado por ${persona.full_name}`, "Contrato DEMO - Alcaldia de Yopal"], P);
    await db.query(
      `INSERT INTO contract_document_submissions (request_id, contract_id, user_id, file_name, file_path, mime_type, size_bytes, status, user_comment, admin_observation, reviewed_by, reviewed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.id, C, P, g.file_name, g.file_path, g.mime_type, g.size_bytes, estadoEntrega,
       "Adjunto el documento solicitado.", observacion,
       estadoEntrega === "aprobado" ? A : null, estadoEntrega === "aprobado" ? new Date() : null]);
    console.log("Entrega:", nombre, "→", estadoEntrega);
  }
}

// --- Actividades del mes con sus anexos -------------------------------------
let [[per]] = await db.query(
  "SELECT id FROM contract_activity_periods WHERE contract_id=? AND user_id=? AND year=? AND month=?",
  [C, P, hoy.getFullYear(), hoy.getMonth() + 1]);
if (!per) {
  const [r] = await db.query(
    "INSERT INTO contract_activity_periods (contract_id, user_id, year, month, status) VALUES (?,?,?,?, 'abierto')",
    [C, P, hoy.getFullYear(), hoy.getMonth() + 1]);
  per = { id: r.insertId };
}
const ACTIVIDADES = [
  ["Mesa de trabajo con la supervisión", "Coordinación", "approved", "Se realizó la mesa de trabajo mensual y se levantó acta con compromisos."],
  ["Revisión del expediente contractual", "Gestión documental", "approved", "Se verificó la completitud del expediente y se organizaron las carpetas."],
  ["Elaboración del informe de avance", "Informes", "submitted", "Informe de avance del periodo, radicado para revisión."],
];
for (const [titulo, categoria, estado, descripcion] of ACTIVIDADES) {
  const [[ya]] = await db.query("SELECT id FROM contract_activities WHERE contract_id=? AND user_id=? AND title=?", [C, P, titulo]);
  if (ya) continue;
  const [r] = await db.query(
    `INSERT INTO contract_activities (contract_id, user_id, title, description, activity_date, status, category, period_id, result, reviewed_by, reviewed_at)
     VALUES (?,?,?,?, CURDATE(), ?, ?, ?, ?, ?, ?)`,
    [C, P, titulo, descripcion, estado, categoria, per.id,
     estado === "approved" ? "Actividad ejecutada según lo planeado." : null,
     estado === "approved" ? A : null, estado === "approved" ? new Date() : null]);
  const g = await guardarPdf(`actividades/${C}`, `Soporte - ${titulo}.pdf`, titulo,
    [`Soporte de la actividad de ${persona.full_name}`, descripcion], P);
  await db.query(
    "INSERT INTO contract_activity_files (activity_id, contract_id, user_id, file_name, file_path, mime_type, size_bytes) VALUES (?,?,?,?,?,?,?)",
    [r.insertId, C, P, g.file_name, g.file_path, g.mime_type, g.size_bytes]);
  console.log("Actividad:", titulo, "→", estado);
}

// --- Evidencias: requisitos y cargas ---------------------------------------
const REQUISITOS = [
  ["Pago de seguridad social", "Seguridad social", "validada"],
  ["Registro fotográfico de la actividad", "Soportes", "cargada"],
];
for (const [nombre, categoria, estadoEv] of REQUISITOS) {
  let [[req]] = await db.query("SELECT id FROM contract_evidence_requirements WHERE contract_id=? AND name=?", [C, nombre]);
  if (!req) {
    const [r] = await db.query(
      `INSERT INTO contract_evidence_requirements (contract_id, name, category, description, required, frequency, applies_to, created_by)
       VALUES (?,?,?,?, 1, 'mensual', 'todos', ?)`,
      [C, nombre, categoria, `Evidencia mensual: ${nombre.toLowerCase()}.`, A]);
    req = { id: r.insertId };
    console.log("Requisito de evidencia:", nombre);
  }
  const [[ev]] = await db.query(
    "SELECT id FROM contract_evidences WHERE requirement_id=? AND user_id=? AND period=?", [req.id, P, periodo]);
  if (!ev) {
    const g = await guardarPdf(`evidencias/${C}`, `${nombre} ${periodo}.pdf`, nombre,
      [`Evidencia de ${persona.full_name}`, `Periodo ${periodo}`, "Contrato DEMO - Alcaldia de Yopal"], P);
    await db.query(
      `INSERT INTO contract_evidences (requirement_id, contract_id, user_id, period, status, file_name, file_path, mime_type, size_bytes, observations, uploaded_by, validated_by, validated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.id, C, P, periodo, estadoEv, g.file_name, g.file_path, g.mime_type, g.size_bytes,
       "Se adjunta la evidencia del periodo.", P,
       estadoEv === "validada" ? A : null, estadoEv === "validada" ? new Date() : null]);
    console.log("Evidencia:", nombre, "→", estadoEv);
  }
}

// --- Reuniones: dos completas con acta, asistencia y anexos -----------------
await db.query(`CREATE TABLE IF NOT EXISTS contract_meetings (
  id INT AUTO_INCREMENT PRIMARY KEY, contract_id INT NOT NULL, meeting_date DATE NOT NULL,
  title VARCHAR(220) NOT NULL, description TEXT NULL, location VARCHAR(160) NULL,
  created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reunion_contrato (contract_id), INDEX idx_reunion_fecha (meeting_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
await db.query(`CREATE TABLE IF NOT EXISTS contract_meeting_files (
  id INT AUTO_INCREMENT PRIMARY KEY, meeting_id INT NOT NULL, contract_id INT NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'anexo', file_name VARCHAR(255) NOT NULL, file_path VARCHAR(255) NOT NULL,
  mime_type VARCHAR(160) NULL, size_bytes BIGINT NULL, uploaded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reunion_arch (meeting_id), INDEX idx_reunion_arch_contrato (contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

const REUNIONES = [
  {
    title: "Comité de seguimiento N.º 1 — arranque del contrato",
    fecha: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-05`,
    location: "Sala de juntas · Alcaldía de Yopal",
    description: "Instalación del comité, presentación del equipo, aprobación del cronograma de trabajo y definición del esquema de reportes mensuales.",
    asistentes: ["Mateo Robayo Moreno (supervisión)", "Natalia Forero Bejarano (apoyo a la gestión)", "Delegada de la Alcaldía de Yopal"],
    compromisos: ["Radicar el cronograma ajustado", "Habilitar el repositorio de evidencias", "Programar la visita de campo"],
    anexos: ["Presentacion de arranque", "Cronograma aprobado en comite"],
  },
  {
    title: "Comité de seguimiento N.º 2 — avance mensual",
    fecha: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-19`,
    location: "Virtual · Google Meet",
    description: "Revisión del avance del periodo, verificación de entregables radicados, estado de las evidencias y acuerdos para el siguiente corte.",
    asistentes: ["Mateo Robayo Moreno (supervisión)", "Natalia Forero Bejarano (apoyo a la gestión)"],
    compromisos: ["Subsanar la evidencia fotográfica pendiente", "Presentar el informe parcial antes del corte"],
    anexos: ["Registro fotografico del comite"],
  },
];
for (const r of REUNIONES) {
  let [[reunion]] = await db.query("SELECT id FROM contract_meetings WHERE contract_id=? AND title=?", [C, r.title]);
  if (!reunion) {
    const [ins] = await db.query(
      "INSERT INTO contract_meetings (contract_id, meeting_date, title, description, location, created_by) VALUES (?,?,?,?,?,?)",
      [C, r.fecha, r.title, r.description, r.location, A]);
    reunion = { id: ins.insertId };
    console.log("Reunión:", r.title);
  }
  const archivos = [
    ["acta", `Acta - ${r.title}.pdf`, "ACTA DE REUNION", [
      `Fecha: ${r.fecha}   Lugar: ${r.location}`, "",
      "TEMAS TRATADOS:", r.description, "",
      "COMPROMISOS:", ...r.compromisos.map((c, i) => `${i + 1}. ${c}`),
    ]],
    ["asistencia", `Asistencia - ${r.title}.pdf`, "LISTA DE ASISTENCIA", [
      `Fecha: ${r.fecha}   Lugar: ${r.location}`, "",
      ...r.asistentes.map((x, i) => `${i + 1}. ${x} ................ (firma)`),
    ]],
    ...r.anexos.map((nombre) => ["anexo", `${nombre}.pdf`, nombre.toUpperCase(), [
      `Soporte de la reunión: ${r.title}`, `Fecha: ${r.fecha}`, "Contrato DEMO - Alcaldia de Yopal",
    ]]),
  ];
  for (const [kind, nombre, titulo, lineas] of archivos) {
    const [[ya]] = await db.query(
      "SELECT id FROM contract_meeting_files WHERE meeting_id=? AND kind=? AND file_name=?", [reunion.id, kind, nombre]);
    if (ya) continue;
    const g = await guardarPdf(`reuniones/${C}`, nombre, titulo, lineas, kind === "acta" ? A : P);
    await db.query(
      "INSERT INTO contract_meeting_files (meeting_id, contract_id, kind, file_name, file_path, mime_type, size_bytes, uploaded_by) VALUES (?,?,?,?,?,?,?,?)",
      [reunion.id, C, kind, g.file_name, g.file_path, g.mime_type, g.size_bytes, kind === "acta" ? A : P]);
    console.log(`  ${kind}: ${nombre}`);
  }
}

console.log("\nDemo lista en el contrato #" + C + " a nombre de " + persona.full_name);
await db.end();
