import { PDF } from "./pdf";

// Generador genérico de informes PDF del módulo contractual.
// Recibe una descripción declarativa (cabecera, filtros aplicados, métricas y
// secciones con tablas o listas de detalle) y produce el documento con el
// mismo lenguaje visual del informe mensual.

const AZUL = [74, 103, 255];
const VIOLETA = [123, 92, 250];
const TINTA = [26, 31, 58];
const SUAVE = [91, 100, 136];
const TENUE = [141, 149, 182];
const LINEA = [223, 227, 243];
const FONDO = [246, 247, 253];

export const COLORES_ESTADO = {
  // actividades
  draft: ["Borrador", TENUE], submitted: ["Presentada", AZUL], in_review: ["En revisión", [224, 147, 12]],
  approved: ["Aprobada", [21, 169, 122]], rejected: ["Rechazada", [226, 68, 95]], needs_changes: ["Requiere ajustes", [224, 147, 12]],
  // evidencias / entregas
  pendiente: ["Pendiente", [224, 147, 12]], cargada: ["Cargada", AZUL], validada: ["Validada", [21, 169, 122]],
  rechazada: ["Rechazada", [226, 68, 95]], requiere_ajuste: ["Requiere ajuste", [224, 147, 12]],
  enviado: ["En revisión", AZUL], aprobado: ["Aprobada", [21, 169, 122]], rechazado: ["Rechazada", [226, 68, 95]],
  // genéricos
  activo: ["Activo", [21, 169, 122]], inactivo: ["Inactivo", TENUE],
};

export function estadoPdf(valor) {
  return COLORES_ESTADO[valor] || [valor ? String(valor) : "—", TENUE];
}

/**
 * documento = {
 *   titulo, subtitulo, contrato: { code, title, company_name, entity_name, responsible_name },
 *   filtros: [[etiqueta, valor], ...],           // lo que el usuario filtró
 *   metricas: [{ etiqueta, valor, color? }, ...],
 *   secciones: [{
 *     titulo,
 *     columnas: [{ t, w?, alineacion? }],        // w fijo en pt; una sin w se lleva el resto
 *     filas: [[celda, ...]],                     // celda: string | { t, negrita?, color?, estado? }
 *     vacio?,                                    // texto si no hay filas
 *     bloques?: [{ titulo, meta?, parrafos: [[etiqueta, texto]], lista?: [texto] }],
 *   }],
 *   generadoPor, generadoEn,
 * }
 */
export function generarInformeGenerico(documento) {
  const { titulo, subtitulo, contrato, filtros = [], metricas = [], secciones = [], generadoPor, generadoEn } = documento;
  const doc = new PDF({ margen: 46 });
  const izq = doc.margen;
  const ancho = doc.anchoUtil;

  const cabecera = (d) => {
    d.rect(0, 0, d.ancho, 4, VIOLETA);
    d.rect(0, 4, d.ancho, 62, FONDO);
    d.rect(izq, 20, 30, 30, AZUL);
    d.texto("GI", izq, 28, { tam: 13, negrita: true, color: [255, 255, 255], ancho: 30, alineacion: "center" });
    d.texto("GRUPO INGENIO", izq + 40, 22, { tam: 11.5, negrita: true, color: TINTA });
    d.texto("Gestión documental · Trazabilidad contractual", izq + 40, 37, { tam: 8, color: TENUE });
    d.texto(contrato.code || "Sin código", izq, 22, { tam: 8.5, negrita: true, color: AZUL, ancho, alineacion: "right" });
    d.texto(d.recortar(contrato.title || "", 220, 8.5), izq, 36, { tam: 8.5, color: TENUE, ancho, alineacion: "right" });
    d.y = 86;
  };
  doc.onNuevaPagina = cabecera;
  cabecera(doc);

  /* ---------- Título ---------- */
  doc.escribir(titulo, { tam: 19, negrita: true, color: TINTA, despues: 4 });
  if (subtitulo) doc.escribir(subtitulo, { tam: 9.5, color: SUAVE, despues: 12 });

  /* ---------- Contrato + filtros aplicados ---------- */
  const datosCabecera = [
    ["Contrato", contrato.title],
    ["Entidad", contrato.company_name || contrato.entity_name || "—"],
    ["Supervisor", contrato.responsible_name || "Sin asignar"],
    ...filtros,
  ];
  const filasBloque = Math.ceil(datosCabecera.length / 2);
  const bloqueAlto = filasBloque * 24 + 12;
  doc.espacio(bloqueAlto + 10);
  doc.rect(izq, doc.y, ancho, bloqueAlto, FONDO);
  const colAncho = (ancho - 36) / 2;
  let fy = doc.y + 12;
  datosCabecera.forEach(([etiqueta, valor], i) => {
    const col = i % 2;
    const x = izq + 18 + col * colAncho;
    const anchoCampo = colAncho - 18;
    doc.texto(String(etiqueta).toUpperCase(), x, fy, { tam: 6.5, negrita: true, color: TENUE, ancho: anchoCampo });
    doc.texto(doc.recortar(String(valor ?? "—"), anchoCampo, 9, true), x, fy + 9, { tam: 9, negrita: true, color: TINTA, ancho: anchoCampo });
    if (col === 1) fy += 24;
  });
  doc.y += bloqueAlto + 16;

  /* ---------- Métricas ---------- */
  if (metricas.length) {
    const porFila = Math.min(metricas.length, 4);
    const tw = (ancho - (porFila - 1) * 10) / porFila;
    for (let inicio = 0; inicio < metricas.length; inicio += porFila) {
      const grupo = metricas.slice(inicio, inicio + porFila);
      doc.espacio(58);
      grupo.forEach((m, i) => {
        const x = izq + i * (tw + 10);
        doc.rect(x, doc.y, tw, 48, [255, 255, 255]);
        doc.rect(x, doc.y, 3, 48, m.color || AZUL);
        doc.texto(String(m.valor), x + 12, doc.y + 9, { tam: 17, negrita: true, color: TINTA, ancho: tw - 18 });
        doc.texto(doc.recortar(m.etiqueta, tw - 18, 7.5), x + 12, doc.y + 31, { tam: 7.5, color: TENUE, ancho: tw - 18 });
      });
      doc.linea(izq, doc.y + 48, izq + ancho, doc.y + 48, LINEA);
      doc.y += 60;
    }
    doc.y += 6;
  }

  /* ---------- Secciones ---------- */
  for (const seccion of secciones) {
    doc.espacio(46);
    doc.y += 6;
    doc.escribir(seccion.titulo, { tam: 13, negrita: true, color: TINTA, despues: 8 });

    if (seccion.columnas && seccion.filas) {
      const fijas = seccion.columnas.reduce((s, c) => s + (c.w || 0), 0);
      const flexibles = seccion.columnas.filter((c) => !c.w).length || 1;
      const restante = Math.max(60, (ancho - fijas) / flexibles);
      const cols = seccion.columnas.map((c) => c.w || restante);
      const xDe = (i) => izq + cols.slice(0, i).reduce((a, b) => a + b, 0);

      const cabeceraTabla = () => {
        doc.espacio(22);
        doc.rect(izq, doc.y, ancho, 20, FONDO);
        seccion.columnas.forEach((c, i) => {
          doc.texto(c.t.toUpperCase(), xDe(i) + 5, doc.y + 6.5, {
            tam: 6.8, negrita: true, color: TENUE, ancho: cols[i] - 8, alineacion: c.alineacion || "left",
          });
        });
        doc.y += 20;
      };
      cabeceraTabla();

      if (!seccion.filas.length) {
        doc.escribir(seccion.vacio || "Sin registros con el filtro aplicado.", { tam: 9, color: TENUE, despues: 8 });
      }

      seccion.filas.forEach((fila, idx) => {
        // La celda más alta define el alto de la fila.
        const altos = fila.map((celda, i) => {
          const c = typeof celda === "object" && celda !== null ? celda : { t: celda };
          return doc.ajustar(String(c.t ?? "—"), cols[i] - 10, 8.3, !!c.negrita).length * 11.4;
        });
        const alto = Math.max(22, Math.max(...altos) + 11);
        if (doc.y + alto > doc.alto - doc.margen - 30) { doc.nuevaPagina(); cabeceraTabla(); }
        if (idx % 2 === 1) doc.rect(izq, doc.y, ancho, alto, [250, 251, 254]);

        fila.forEach((celda, i) => {
          const c = typeof celda === "object" && celda !== null ? celda : { t: celda };
          let color = c.color || (c.negrita ? TINTA : SUAVE);
          let texto = c.t;
          let negrita = !!c.negrita;
          if (c.estado) { const [etq, col] = estadoPdf(c.estado); texto = etq; color = col; negrita = true; }
          doc.texto(String(texto ?? "—"), xDe(i) + 5, doc.y + 6, {
            tam: c.estado ? 7.6 : 8.3, negrita, color,
            ancho: cols[i] - 10, alineacion: seccion.columnas[i].alineacion || "left",
          });
        });
        doc.y += alto;
        doc.linea(izq, doc.y, izq + ancho, doc.y, LINEA);
      });
    }

    if (seccion.bloques) {
      for (const [i, bloque] of seccion.bloques.entries()) {
        doc.espacio(46);
        doc.rect(izq, doc.y, 2.5, 15, VIOLETA);
        doc.texto(`${String(i + 1).padStart(2, "0")}. ${bloque.titulo}`, izq + 11, doc.y, { tam: 10.5, negrita: true, color: TINTA, ancho: ancho - 11 });
        doc.y += doc.ajustar(`00. ${bloque.titulo}`, ancho - 11, 10.5, true).length * 14 + 3;
        if (bloque.meta) {
          doc.texto(bloque.meta, izq + 11, doc.y, { tam: 7.8, color: TENUE, ancho: ancho - 11 });
          doc.y += 15;
        }
        for (const [etiqueta, valor] of (bloque.parrafos || []).filter(([, v]) => v && String(v).trim())) {
          doc.espacio(24);
          doc.texto(etiqueta.toUpperCase(), izq + 11, doc.y, { tam: 6.5, negrita: true, color: TENUE, ancho: ancho - 11 });
          doc.y += 9;
          doc.escribir(String(valor).trim(), { x: izq + 11, ancho: ancho - 11, tam: 9, color: SUAVE, despues: 5 });
        }
        for (const item of bloque.lista || []) {
          doc.espacio(13);
          doc.texto(`•  ${item}`, izq + 15, doc.y, { tam: 8.2, color: SUAVE, ancho: ancho - 26 });
          doc.y += 12;
        }
        doc.y += 6;
        doc.linea(izq, doc.y, izq + ancho, doc.y, LINEA);
        doc.y += 12;
      }
    }
  }

  /* ---------- Pie ---------- */
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
