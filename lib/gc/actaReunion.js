import { PDF } from "./pdf";

// Acta de reunión y lista de asistencia como documentos descargables.
// Se generan a partir de lo registrado en el sistema, en PDF o en Word, para
// que la reunión tenga siempre su soporte formal aunque nadie suba un archivo.

const AZUL = [74, 103, 255];
const VIOLETA = [123, 92, 250];
const TINTA = [26, 31, 58];
const SUAVE = [91, 100, 136];
const TENUE = [141, 149, 182];
const LINEA = [223, 227, 243];
const FONDO = [246, 247, 253];

const fmt = (s) => {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

const TITULOS = { acta: "Acta de reunión", asistencia: "Lista de asistencia" };

/* ============================ PDF ============================ */

export function generarActaPdf({ tipo, contrato, reunion, participantes, generadoPor, generadoEn }) {
  const doc = new PDF({ margen: 46 });
  const izq = doc.margen;
  const ancho = doc.anchoUtil;

  const cabecera = (d) => {
    d.rect(0, 0, d.ancho, 4, VIOLETA);
    d.rect(0, 4, d.ancho, 62, FONDO);
    d.rect(izq, 20, 30, 30, AZUL);
    d.texto("GI", izq, 28, { tam: 13, negrita: true, color: [255, 255, 255], ancho: 30, alineacion: "center" });
    d.texto("GRUPO INGENIO", izq + 40, 22, { tam: 11.5, negrita: true, color: TINTA });
    d.texto("Gestión documental · Seguimiento contractual", izq + 40, 37, { tam: 8, color: TENUE });
    d.texto(contrato.code || "Sin código", izq, 22, { tam: 8.5, negrita: true, color: AZUL, ancho, alineacion: "right" });
    d.texto(fmt(reunion.meeting_date), izq, 36, { tam: 8.5, color: TENUE, ancho, alineacion: "right" });
    d.y = 86;
  };
  doc.onNuevaPagina = cabecera;
  cabecera(doc);

  doc.escribir(TITULOS[tipo], { tam: 20, negrita: true, color: TINTA, despues: 4 });
  doc.escribir(reunion.title, { tam: 11, color: SUAVE, despues: 16 });

  /* Datos de la reunión */
  const datos = [
    ["Contrato", contrato.title],
    ["Entidad", contrato.company_name || contrato.entity_name || "—"],
    ["Fecha de la reunión", fmt(reunion.meeting_date)],
    ["Lugar", reunion.location || "No indicado"],
    ["Convoca", reunion.created_by_name || "—"],
    ["Supervisor del contrato", contrato.responsible_name || "Sin asignar"],
  ];
  const alto = Math.ceil(datos.length / 2) * 24 + 12;
  doc.espacio(alto + 10);
  doc.rect(izq, doc.y, ancho, alto, FONDO);
  const colAncho = (ancho - 36) / 2;
  let fy = doc.y + 12;
  datos.forEach(([etiqueta, valor], i) => {
    const col = i % 2;
    const x = izq + 18 + col * colAncho;
    const w = colAncho - 18;
    doc.texto(etiqueta.toUpperCase(), x, fy, { tam: 6.5, negrita: true, color: TENUE, ancho: w });
    doc.texto(doc.recortar(String(valor || "—"), w, 9, true), x, fy + 9, { tam: 9, negrita: true, color: TINTA, ancho: w });
    if (col === 1) fy += 24;
  });
  doc.y += alto + 18;

  if (tipo === "acta") {
    /* Desarrollo de la reunión */
    doc.escribir("Desarrollo de la reunión", { tam: 13, negrita: true, color: TINTA, despues: 8 });
    doc.escribir(reunion.description?.trim() || "No se registró una descripción de los temas tratados.",
      { tam: 10, color: SUAVE, despues: 18 });

    /* Asistentes, tomados del equipo del contrato */
    doc.escribir("Asistentes", { tam: 13, negrita: true, color: TINTA, despues: 8 });
    participantes.forEach((p, i) => {
      doc.espacio(15);
      doc.texto(`${i + 1}.  ${p.full_name}`, izq + 4, doc.y, { tam: 9.5, negrita: true, color: TINTA, ancho: ancho - 160 });
      doc.texto(p.role_in_contract || p.cargo || "—", izq, doc.y, { tam: 8.5, color: TENUE, ancho, alineacion: "right" });
      doc.y += 14;
    });
    if (!participantes.length) doc.escribir("Sin participantes registrados en el contrato.", { tam: 9, color: TENUE });

    /* Espacio para compromisos, que se diligencia a mano si hace falta */
    doc.y += 14;
    doc.espacio(90);
    doc.escribir("Compromisos y acuerdos", { tam: 13, negrita: true, color: TINTA, despues: 10 });
    const cols = [ancho - 190, 110, 80];
    doc.rect(izq, doc.y, ancho, 20, FONDO);
    ["Compromiso", "Responsable", "Fecha"].forEach((t, i) => {
      const x = izq + cols.slice(0, i).reduce((a, b) => a + b, 0);
      doc.texto(t.toUpperCase(), x + 5, doc.y + 6.5, { tam: 6.8, negrita: true, color: TENUE, ancho: cols[i] - 8 });
    });
    doc.y += 20;
    for (let i = 0; i < 5; i++) {
      doc.espacio(24);
      doc.y += 22;
      doc.linea(izq, doc.y, izq + ancho, doc.y, LINEA);
    }
  } else {
    /* Lista de asistencia con espacio de firma */
    doc.escribir("Registro de asistentes", { tam: 13, negrita: true, color: TINTA, despues: 4 });
    doc.escribir("Cada asistente firma en la casilla correspondiente.", { tam: 9, color: TENUE, despues: 10 });

    const cols = [24, ancho - 24 - 130 - 150, 130, 150];
    const titulos = ["N.º", "Nombre completo", "Rol en el contrato", "Firma"];
    const xDe = (i) => izq + cols.slice(0, i).reduce((a, b) => a + b, 0);
    const cabeceraTabla = () => {
      doc.espacio(22);
      doc.rect(izq, doc.y, ancho, 20, FONDO);
      titulos.forEach((t, i) => doc.texto(t.toUpperCase(), xDe(i) + 5, doc.y + 6.5, { tam: 6.8, negrita: true, color: TENUE, ancho: cols[i] - 8 }));
      doc.y += 20;
    };
    cabeceraTabla();

    // Los participantes del contrato, más filas en blanco para invitados.
    const filas = [...participantes.map((p) => [p.full_name, p.role_in_contract || p.cargo || "—"]),
      ...Array.from({ length: 4 }, () => ["", ""])];
    filas.forEach(([nombre, rol], i) => {
      if (doc.y + 30 > doc.alto - doc.margen - 30) { doc.nuevaPagina(); cabeceraTabla(); }
      if (i % 2 === 1) doc.rect(izq, doc.y, ancho, 30, [250, 251, 254]);
      doc.texto(String(i + 1).padStart(2, "0"), xDe(0) + 5, doc.y + 10, { tam: 8, color: TENUE, ancho: cols[0] - 8 });
      doc.texto(nombre || "", xDe(1) + 5, doc.y + 10, { tam: 9, negrita: !!nombre, color: TINTA, ancho: cols[1] - 10 });
      doc.texto(rol || "", xDe(2) + 5, doc.y + 10, { tam: 8.5, color: SUAVE, ancho: cols[2] - 8 });
      // Renglón para la firma.
      doc.linea(xDe(3) + 6, doc.y + 22, xDe(3) + cols[3] - 8, doc.y + 22, [190, 198, 220], 0.8);
      doc.y += 30;
      doc.linea(izq, doc.y, izq + ancho, doc.y, LINEA);
    });
  }

  /* Firmas de cierre */
  doc.y += 24;
  doc.espacio(76);
  const anchoFirma = (ancho - 40) / 2;
  [[reunion.created_by_name || "—", "Elaboró"], [contrato.responsible_name || "Sin asignar", "Supervisor del contrato"]]
    .forEach(([nombre, cargo], i) => {
      const x = izq + i * (anchoFirma + 40);
      doc.linea(x, doc.y + 28, x + anchoFirma, doc.y + 28, [180, 188, 214], 0.9);
      doc.texto(nombre, x, doc.y + 33, { tam: 9, negrita: true, color: TINTA, ancho: anchoFirma });
      doc.texto(cargo, x, doc.y + 45, { tam: 7.5, color: TENUE, ancho: anchoFirma });
    });
  doc.y += 60;

  const total = doc.paginas.length;
  doc.paginas.forEach((pagina, i) => {
    const anterior = doc.actual;
    doc.actual = pagina;
    const yPie = doc.alto - 30;
    doc.linea(izq, yPie, izq + ancho, yPie, LINEA);
    doc.texto(`Generado por ${generadoPor} · ${generadoEn} · Sistema de gestión documental de Grupo Ingenio`,
      izq, yPie + 6, { tam: 6.8, color: TENUE, ancho: ancho - 60 });
    doc.texto(`${i + 1} / ${total}`, izq, yPie + 6, { tam: 7.2, negrita: true, color: SUAVE, ancho, alineacion: "right" });
    doc.actual = anterior;
  });

  return doc.toBuffer();
}

/* ============================ Word ============================ */

const escapar = (t) => String(t ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Word abre sin problema un HTML con las cabeceras adecuadas, así que el
// documento editable no necesita ninguna dependencia externa.
export function generarActaWord({ tipo, contrato, reunion, participantes, generadoPor, generadoEn }) {
  const filas = tipo === "asistencia"
    ? [...participantes.map((p) => [p.full_name, p.role_in_contract || p.cargo || ""]),
       ...Array.from({ length: 4 }, () => ["", ""])]
    : participantes.map((p) => [p.full_name, p.role_in_contract || p.cargo || ""]);

  const tablaAsistencia = `
    <table>
      <tr>
        <th style="width:6%">N.º</th><th style="width:42%">Nombre completo</th>
        <th style="width:26%">Rol en el contrato</th><th style="width:26%">Firma</th>
      </tr>
      ${filas.map(([n, r], i) => `
        <tr>
          <td>${String(i + 1).padStart(2, "0")}</td>
          <td>${escapar(n)}</td><td>${escapar(r)}</td><td>&nbsp;</td>
        </tr>`).join("")}
    </table>`;

  const cuerpoActa = `
    <h2>Desarrollo de la reunión</h2>
    <p>${escapar(reunion.description?.trim() || "No se registró una descripción de los temas tratados.")}</p>
    <h2>Asistentes</h2>
    ${tablaAsistencia}
    <h2>Compromisos y acuerdos</h2>
    <table>
      <tr><th style="width:52%">Compromiso</th><th style="width:28%">Responsable</th><th style="width:20%">Fecha</th></tr>
      ${Array.from({ length: 5 }, () => "<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>").join("")}
    </table>`;

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>${escapar(TITULOS[tipo])} · ${escapar(reunion.title)}</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1f3a; }
  .marca { border-bottom: 3px solid #7b5cfa; padding-bottom: 8pt; margin-bottom: 16pt; }
  .marca b { font-size: 13pt; }
  .marca span { color: #8d95b6; font-size: 9pt; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  h1 + p { color: #5b6488; margin: 0 0 16pt; }
  h2 { font-size: 12pt; margin: 18pt 0 6pt; border-bottom: 1px solid #dfe3f3; padding-bottom: 4pt; }
  table { border-collapse: collapse; width: 100%; margin-top: 6pt; }
  th { background: #f6f7fd; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em;
       color: #8d95b6; text-align: left; padding: 6pt; border: 1px solid #dfe3f3; }
  td { padding: 8pt 6pt; border: 1px solid #dfe3f3; font-size: 10pt; height: 22pt; }
  .datos td { border: 0; padding: 3pt 0; }
  .datos .et { font-size: 8pt; text-transform: uppercase; color: #8d95b6; letter-spacing: .06em; }
  .firmas { margin-top: 36pt; }
  .firmas td { border: 0; border-top: 1px solid #b4bcd6; padding-top: 6pt; width: 45%; }
  .firmas .cargo { font-size: 9pt; color: #8d95b6; border: 0; padding-top: 2pt; }
  .pie { margin-top: 26pt; font-size: 8pt; color: #8d95b6; border-top: 1px solid #dfe3f3; padding-top: 6pt; }
</style>
</head>
<body>
  <div class="marca"><b>GRUPO INGENIO</b><br><span>Gestión documental · Seguimiento contractual</span></div>

  <h1>${escapar(TITULOS[tipo])}</h1>
  <p>${escapar(reunion.title)}</p>

  <table class="datos">
    <tr><td class="et">Contrato</td><td class="et">Entidad</td></tr>
    <tr><td><b>${escapar(contrato.title)}</b></td><td><b>${escapar(contrato.company_name || contrato.entity_name || "—")}</b></td></tr>
    <tr><td class="et">Fecha de la reunión</td><td class="et">Lugar</td></tr>
    <tr><td><b>${fmt(reunion.meeting_date)}</b></td><td><b>${escapar(reunion.location || "No indicado")}</b></td></tr>
    <tr><td class="et">Convoca</td><td class="et">Supervisor del contrato</td></tr>
    <tr><td><b>${escapar(reunion.created_by_name || "—")}</b></td><td><b>${escapar(contrato.responsible_name || "Sin asignar")}</b></td></tr>
  </table>

  ${tipo === "acta" ? cuerpoActa : `<h2>Registro de asistentes</h2><p>Cada asistente firma en la casilla correspondiente.</p>${tablaAsistencia}`}

  <table class="firmas">
    <tr><td><b>${escapar(reunion.created_by_name || "—")}</b></td><td>&nbsp;</td>
        <td><b>${escapar(contrato.responsible_name || "Sin asignar")}</b></td></tr>
    <tr><td class="cargo">Elaboró</td><td>&nbsp;</td><td class="cargo">Supervisor del contrato</td></tr>
  </table>

  <p class="pie">Generado por ${escapar(generadoPor)} · ${escapar(generadoEn)} · Sistema de gestión documental de Grupo Ingenio</p>
</body>
</html>`;

  // El BOM hace que Word respete los acentos al abrir el archivo.
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(html, "utf8")]);
}
