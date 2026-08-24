import { PDF, anchoTexto } from "./pdf";

// Formato del informe mensual de actividades por contratista.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const AZUL = [74, 103, 255];
const VIOLETA = [123, 92, 250];
const TINTA = [26, 31, 58];
const SUAVE = [91, 100, 136];
const TENUE = [141, 149, 182];
const LINEA = [223, 227, 243];
const FONDO = [246, 247, 253];

const ESTADOS = {
  draft: ["Borrador", [141, 149, 182]],
  submitted: ["Presentada", [74, 103, 255]],
  in_review: ["En revisión", [224, 147, 12]],
  approved: ["Aprobada", [21, 169, 122]],
  rejected: ["Rechazada", [226, 68, 95]],
  needs_changes: ["Requiere ajustes", [224, 147, 12]],
};

const fecha = (s) => {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

export function generarInformeActividades(datos) {
  const { contrato, contratista, year, month, actividades, anexosPorActividad, generadoPor, generadoEn } = datos;
  const doc = new PDF({ margen: 46 });
  const izq = doc.margen;
  const ancho = doc.anchoUtil;

  // Cabecera repetida en cada página.
  const cabecera = (d) => {
    d.rect(0, 0, d.ancho, 4, VIOLETA);
    d.rect(0, 4, d.ancho, 62, FONDO);
    d.rect(izq, 20, 30, 30, AZUL);
    d.texto("GI", izq, 28, { tam: 13, negrita: true, color: [255, 255, 255], ancho: 30, alineacion: "center" });
    d.texto("GRUPO INGENIO", izq + 40, 22, { tam: 11.5, negrita: true, color: TINTA });
    d.texto("Gestión documental · Seguimiento contractual", izq + 40, 37, { tam: 8, color: TENUE });
    d.texto(`${contrato.code || "Sin código"}`, izq, 22, { tam: 8.5, negrita: true, color: AZUL, ancho, alineacion: "right" });
    d.texto(`${MESES[month - 1]} ${year}`, izq, 36, { tam: 8.5, color: TENUE, ancho, alineacion: "right" });
    d.y = 86;
  };

  doc.onNuevaPagina = cabecera;
  cabecera(doc);

  /* ---------- Título ---------- */
  doc.escribir("Informe mensual de actividades", { tam: 20, negrita: true, color: TINTA, despues: 4 });
  doc.escribir(
    `Relación de actividades ejecutadas por el contratista durante ${MESES[month - 1]} de ${year}.`,
    { tam: 9.5, color: SUAVE, despues: 16 }
  );

  /* ---------- Datos del contrato y del contratista ---------- */
  const bloqueAlto = 84;
  doc.espacio(bloqueAlto + 10);
  doc.rect(izq, doc.y, ancho, bloqueAlto, FONDO);
  const colAncho = (ancho - 36) / 2;
  const filas = [
    [["Contrato", contrato.title], ["Contratista", contratista.full_name]],
    [["Empresa contratante", contrato.company_name || contrato.entity_name || "—"], ["Rol en el contrato", contratista.role_in_contract || "Contratista"]],
    [["Supervisor", contrato.responsible_name || "Sin asignar"], ["Periodo reportado", `${MESES[month - 1]} ${year}`]],
  ];
  let fy = doc.y + 14;
  for (const fila of filas) {
    fila.forEach(([etiqueta, valor], i) => {
      const x = izq + 18 + i * colAncho;
      const anchoCampo = colAncho - 18;
      doc.texto(etiqueta.toUpperCase(), x, fy, { tam: 6.5, negrita: true, color: TENUE, ancho: anchoCampo });
      // Se recorta a una línea para que las filas del bloque no se solapen.
      doc.texto(doc.recortar(String(valor || "—"), anchoCampo, 9, true), x, fy + 9,
        { tam: 9, negrita: true, color: TINTA, ancho: anchoCampo });
    });
    fy += 24;
  }
  doc.y += bloqueAlto + 18;

  /* ---------- Resumen ---------- */
  const aprobadas = actividades.filter((a) => a.status === "approved").length;
  const totalAnexos = actividades.reduce((s, a) => s + (anexosPorActividad[a.id]?.length || 0), 0);
  const tarjetas = [
    ["Actividades registradas", String(actividades.length)],
    ["Actividades aprobadas", String(aprobadas)],
    ["Soportes adjuntos", String(totalAnexos)],
  ];
  doc.espacio(58);
  const tw = (ancho - 20) / 3;
  tarjetas.forEach(([etiqueta, valor], i) => {
    const x = izq + i * (tw + 10);
    doc.rect(x, doc.y, tw, 48, [255, 255, 255]);
    doc.rect(x, doc.y, 3, 48, i === 1 ? [21, 169, 122] : AZUL);
    doc.texto(valor, x + 14, doc.y + 9, { tam: 17, negrita: true, color: TINTA, ancho: tw - 20 });
    doc.texto(etiqueta, x + 14, doc.y + 31, { tam: 7.5, color: TENUE, ancho: tw - 20 });
  });
  doc.linea(izq, doc.y + 48, izq + ancho, doc.y + 48, LINEA);
  doc.y += 68;

  /* ---------- Tabla de actividades ---------- */
  doc.escribir("Relación de actividades", { tam: 13, negrita: true, color: TINTA, despues: 8 });

  const cols = [26, 58, ancho - 26 - 58 - 88 - 74 - 38, 88, 74, 38];
  const titulos = ["N.º", "Fecha", "Actividad", "Categoría", "Estado", "Anexos"];
  const xDe = (i) => izq + cols.slice(0, i).reduce((a, b) => a + b, 0);

  const cabeceraTabla = () => {
    doc.espacio(22);
    doc.rect(izq, doc.y, ancho, 20, FONDO);
    titulos.forEach((t, i) => {
      doc.texto(t.toUpperCase(), xDe(i) + 5, doc.y + 6.5, {
        tam: 6.8, negrita: true, color: TENUE, ancho: cols[i] - 8,
        alineacion: i === 5 ? "right" : "left",
      });
    });
    doc.y += 20;
  };
  cabeceraTabla();

  if (!actividades.length) {
    doc.escribir("No se registraron actividades en este periodo.", { tam: 9, color: TENUE, despues: 10 });
  }

  actividades.forEach((a, i) => {
    const lineasTitulo = doc.ajustar(a.title, cols[2] - 10, 8.5, true);
    const alto = Math.max(24, lineasTitulo.length * 12 + 12);
    if (doc.y + alto > doc.alto - doc.margen - 30) { doc.nuevaPagina(); cabeceraTabla(); }

    if (i % 2 === 1) doc.rect(izq, doc.y, ancho, alto, [250, 251, 254]);
    const [etiqueta, colorEstado] = ESTADOS[a.status] || ["—", TENUE];
    const cy = doc.y + 7;

    doc.texto(String(i + 1).padStart(2, "0"), xDe(0) + 5, cy, { tam: 8, color: TENUE, ancho: cols[0] - 8 });
    doc.texto(fecha(a.activity_date), xDe(1) + 5, cy, { tam: 8, color: SUAVE, ancho: cols[1] - 8 });
    doc.texto(a.title, xDe(2) + 5, cy, { tam: 8.5, negrita: true, color: TINTA, ancho: cols[2] - 10 });
    doc.texto(a.category || "—", xDe(3) + 5, cy, { tam: 8, color: SUAVE, ancho: cols[3] - 8 });
    doc.texto(etiqueta, xDe(4) + 5, cy, { tam: 7.6, negrita: true, color: colorEstado, ancho: cols[4] - 8 });
    doc.texto(String(anexosPorActividad[a.id]?.length || 0), xDe(5), cy, { tam: 8, color: SUAVE, ancho: cols[5] - 5, alineacion: "right" });

    doc.y += alto;
    doc.linea(izq, doc.y, izq + ancho, doc.y, LINEA);
  });

  /* ---------- Detalle por actividad ---------- */
  if (actividades.length) {
    doc.y += 22;
    doc.espacio(40);
    doc.escribir("Detalle de las actividades", { tam: 13, negrita: true, color: TINTA, despues: 10 });

    actividades.forEach((a, i) => {
      const anexos = anexosPorActividad[a.id] || [];
      const [etiqueta, colorEstado] = ESTADOS[a.status] || ["—", TENUE];

      doc.espacio(52);
      doc.rect(izq, doc.y, 2.5, 15, VIOLETA);
      doc.texto(`${String(i + 1).padStart(2, "0")}. ${a.title}`, izq + 11, doc.y, { tam: 11, negrita: true, color: TINTA, ancho: ancho - 11 });
      doc.y += doc.ajustar(`${i + 1}. ${a.title}`, ancho - 11, 11, true).length * 15 + 3;

      doc.texto(`${fecha(a.activity_date)}   ·   ${a.category || "Sin categoría"}   ·   ${etiqueta}   ·   ${anexos.length} soporte(s)`,
        izq + 11, doc.y, { tam: 7.8, color: TENUE, ancho: ancho - 11 });
      doc.y += 16;

      const secciones = [
        ["Descripción de lo realizado", a.description],
        ["Resultado", a.result],
        ["Observaciones del contratista", a.user_observation],
        ["Comentario de revisión", a.admin_comment],
      ].filter(([, v]) => v && String(v).trim());

      for (const [titulo, valor] of secciones) {
        doc.espacio(26);
        doc.texto(titulo.toUpperCase(), izq + 11, doc.y, { tam: 6.5, negrita: true, color: TENUE, ancho: ancho - 11 });
        doc.y += 9;
        doc.escribir(String(valor).trim(), { x: izq + 11, ancho: ancho - 11, tam: 9, color: SUAVE, despues: 6 });
      }

      if (anexos.length) {
        doc.espacio(20);
        doc.texto("SOPORTES ADJUNTOS", izq + 11, doc.y, { tam: 6.5, negrita: true, color: TENUE, ancho: ancho - 11 });
        doc.y += 10;
        for (const anexo of anexos) {
          doc.espacio(13);
          const kb = anexo.size_bytes ? `${Math.max(1, Math.round(anexo.size_bytes / 1024))} KB` : "—";
          doc.texto(`•  ${anexo.file_name}`, izq + 15, doc.y, { tam: 8.2, color: SUAVE, ancho: ancho - 100 });
          doc.texto(kb, izq, doc.y, { tam: 7.8, color: TENUE, ancho, alineacion: "right" });
          doc.y += 12;
        }
        doc.y += 4;
      }

      doc.y += 6;
      doc.linea(izq, doc.y, izq + ancho, doc.y, LINEA);
      doc.y += 14;
    });
  }

  /* ---------- Firmas ---------- */
  doc.espacio(78);
  doc.y += 14;
  const anchoFirma = (ancho - 40) / 2;
  [[contratista.full_name, contratista.role_in_contract || "Contratista"],
   [contrato.responsible_name || "Sin asignar", "Supervisor del contrato"]]
    .forEach(([nombre, cargo], i) => {
      const x = izq + i * (anchoFirma + 40);
      doc.linea(x, doc.y + 28, x + anchoFirma, doc.y + 28, [180, 188, 214], 0.9);
      doc.texto(nombre, x, doc.y + 33, { tam: 9, negrita: true, color: TINTA, ancho: anchoFirma });
      doc.texto(cargo, x, doc.y + 45, { tam: 7.5, color: TENUE, ancho: anchoFirma });
    });
  doc.y += 62;

  /* ---------- Pie en todas las páginas ---------- */
  const total = doc.paginas.length;
  doc.paginas.forEach((pagina, i) => {
    const anterior = doc.actual;
    doc.actual = pagina;
    const yPie = doc.alto - 30;
    doc.linea(izq, yPie, izq + ancho, yPie, LINEA);
    doc.texto(
      `Generado por ${generadoPor} · ${generadoEn} · Documento emitido por el sistema de gestión documental de Grupo Ingenio`,
      izq, yPie + 6, { tam: 6.8, color: TENUE, ancho: ancho - 60 }
    );
    doc.texto(`${i + 1} / ${total}`, izq, yPie + 6, { tam: 7.2, negrita: true, color: SUAVE, ancho, alineacion: "right" });
    doc.actual = anterior;
  });

  return doc.toBuffer();
}
