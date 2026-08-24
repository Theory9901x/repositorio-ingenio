// Constructor de documentos PDF sin dependencias externas.
// Cubre lo necesario para informes: texto con ajuste de línea, tablas,
// rectángulos, líneas, colores y paginación automática.

// Anchos de las fuentes estándar (unidades/1000) para los caracteres 32..126.
const ANCHOS_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const ANCHOS_NEGRITA = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Caracteres fuera de Latin-1 que sí existen en WinAnsiEncoding.
const WINANSI_EXTRA = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
  "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c,
  "ž": 0x9e, "Ÿ": 0x9f,
};

function aWinAnsi(texto) {
  const bytes = [];
  for (const ch of String(texto ?? "")) {
    const c = ch.codePointAt(0);
    if (c === 10 || c === 13) continue;
    if (c >= 32 && c <= 255) bytes.push(c);
    else if (WINANSI_EXTRA[ch] !== undefined) bytes.push(WINANSI_EXTRA[ch]);
    else bytes.push(63); // ?
  }
  return Buffer.from(bytes);
}

function anchoTexto(texto, tam, negrita) {
  const tabla = negrita ? ANCHOS_NEGRITA : ANCHOS_NORMAL;
  let total = 0;
  for (const b of aWinAnsi(texto)) {
    // Los acentuados y símbolos fuera del rango ASCII se aproximan con el
    // ancho de una letra minúscula, suficiente para el ajuste de línea.
    total += b >= 32 && b <= 126 ? tabla[b - 32] : 556;
  }
  return (total * tam) / 1000;
}

function escapar(buf) {
  const salida = [];
  for (const b of buf) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) salida.push(0x5c);
    salida.push(b);
  }
  return Buffer.from(salida);
}

export class PDF {
  constructor({ ancho = 595.28, alto = 841.89, margen = 48 } = {}) {
    this.ancho = ancho;
    this.alto = alto;
    this.margen = margen;
    this.paginas = [];
    this.actual = null;
    this.y = 0;
    this.onNuevaPagina = null;
    this.nuevaPagina();
  }

  get anchoUtil() { return this.ancho - this.margen * 2; }

  nuevaPagina() {
    this.actual = [];
    this.paginas.push(this.actual);
    this.y = this.margen;
    if (this.onNuevaPagina) this.onNuevaPagina(this);
  }

  // Reserva espacio vertical; si no cabe, abre una página nueva.
  espacio(alto) {
    if (this.y + alto > this.alto - this.margen - 26) this.nuevaPagina();
  }

  color(op, [r, g, b]) {
    this.actual.push(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} ${op}`);
  }

  rect(x, yTop, ancho, alto, relleno) {
    this.color("rg", relleno);
    this.actual.push(`${x.toFixed(2)} ${(this.alto - yTop - alto).toFixed(2)} ${ancho.toFixed(2)} ${alto.toFixed(2)} re f`);
  }

  linea(x1, yTop1, x2, yTop2, color = [220, 224, 238], grosor = 0.7) {
    this.color("RG", color);
    this.actual.push(`${grosor} w ${x1.toFixed(2)} ${(this.alto - yTop1).toFixed(2)} m ${x2.toFixed(2)} ${(this.alto - yTop2).toFixed(2)} l S`);
  }

  // Recorta el texto a una sola línea del ancho indicado.
  recortar(texto, ancho, tam, negrita) {
    const t = String(texto ?? "");
    if (anchoTexto(t, tam, negrita) <= ancho) return t;
    let corte = t;
    while (corte.length > 1 && anchoTexto(corte + "…", tam, negrita) > ancho) corte = corte.slice(0, -1);
    return corte.trimEnd() + "…";
  }

  // Divide el texto para que quepa en un ancho dado.
  ajustar(texto, ancho, tam, negrita) {
    const parrafos = String(texto ?? "").split(/\r?\n/);
    const lineas = [];
    for (const parrafo of parrafos) {
      let linea = "";
      for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
        const prueba = linea ? `${linea} ${palabra}` : palabra;
        if (anchoTexto(prueba, tam, negrita) <= ancho || !linea) linea = prueba;
        else { lineas.push(linea); linea = palabra; }
      }
      lineas.push(linea);
    }
    return lineas;
  }

  // Escribe texto y devuelve el alto ocupado. Avanza el cursor si mueve=true.
  texto(contenido, x, yTop, opciones = {}) {
    const { tam = 10, negrita = false, color = [30, 34, 60], ancho = this.anchoUtil, interlineado = 1.42, alineacion = "left" } = opciones;
    const lineas = this.ajustar(contenido, ancho, tam, negrita);
    const salto = tam * interlineado;
    this.color("rg", color);
    lineas.forEach((linea, i) => {
      let px = x;
      if (alineacion !== "left") {
        const sobra = ancho - anchoTexto(linea, tam, negrita);
        px = alineacion === "right" ? x + sobra : x + sobra / 2;
      }
      const base = this.alto - (yTop + tam + i * salto);
      this.actual.push(
        `BT /${negrita ? "F2" : "F1"} ${tam} Tf ${px.toFixed(2)} ${base.toFixed(2)} Td (${escapar(aWinAnsi(linea)).toString("latin1")}) Tj ET`
      );
    });
    return lineas.length * salto;
  }

  // Escribe en el cursor y lo avanza.
  escribir(contenido, opciones = {}) {
    const alto = this.ajustar(contenido, opciones.ancho ?? this.anchoUtil, opciones.tam ?? 10, opciones.negrita).length
      * (opciones.tam ?? 10) * (opciones.interlineado ?? 1.42);
    this.espacio(alto);
    this.texto(contenido, opciones.x ?? this.margen, this.y, opciones);
    this.y += alto + (opciones.despues ?? 0);
  }

  toBuffer() {
    const objetos = [];
    const agregar = (contenido) => { objetos.push(contenido); return objetos.length; };

    const idFuenteNormal = agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const idFuenteNegrita = agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const idPaginas = agregar(null); // se completa al final

    const idsPagina = [];
    for (const pagina of this.paginas) {
      const flujo = pagina.join("\n");
      const idFlujo = agregar({ stream: flujo });
      idsPagina.push(agregar(
        `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${this.ancho.toFixed(2)} ${this.alto.toFixed(2)}] ` +
        `/Resources << /Font << /F1 ${idFuenteNormal} 0 R /F2 ${idFuenteNegrita} 0 R >> >> /Contents ${idFlujo} 0 R >>`
      ));
    }
    objetos[idPaginas - 1] = `<< /Type /Pages /Count ${idsPagina.length} /Kids [${idsPagina.map((i) => `${i} 0 R`).join(" ")}] >>`;
    const idCatalogo = agregar(`<< /Type /Catalog /Pages ${idPaginas} 0 R >>`);

    const partes = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const offsets = [];
    let posicion = partes[0].length;

    objetos.forEach((obj, i) => {
      const num = i + 1;
      let cuerpo;
      if (obj && typeof obj === "object" && obj.stream !== undefined) {
        const datos = Buffer.from(obj.stream, "latin1");
        cuerpo = Buffer.concat([
          Buffer.from(`${num} 0 obj\n<< /Length ${datos.length} >>\nstream\n`, "latin1"),
          datos,
          Buffer.from("\nendstream\nendobj\n", "latin1"),
        ]);
      } else {
        cuerpo = Buffer.from(`${num} 0 obj\n${obj}\nendobj\n`, "latin1");
      }
      offsets.push(posicion);
      partes.push(cuerpo);
      posicion += cuerpo.length;
    });

    let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${objetos.length + 1} /Root ${idCatalogo} 0 R >>\nstartxref\n${posicion}\n%%EOF\n`;
    partes.push(Buffer.from(xref, "latin1"));

    return Buffer.concat(partes);
  }
}

export { anchoTexto };
