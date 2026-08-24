"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle, Check, Download, FileArchive, FileDown, FileImage, FileSpreadsheet, FileText,
  Inbox, Presentation, X,
} from "lucide-react";

/* ---------- Utilidades compartidas ---------- */

// Exporta en PDF el apartado con los filtros activos. Es un enlace: el
// navegador descarga el informe generado por el servidor.
export function BotonExportar({ contratoId, seccion, filtros = {}, etiqueta = "Exportar PDF", primario = false }) {
  const p = new URLSearchParams({ seccion });
  for (const [k, v] of Object.entries(filtros)) {
    if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  }
  return (
    <a className={`gc-btn ${primario ? "primary" : "ghost"}`}
      href={`/api/gc/contracts/${contratoId}/export?${p}`} title="Descargar informe PDF con la información filtrada">
      <FileDown size={15} /> {etiqueta}
    </a>
  );
}

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function fmtFecha(s) {
  if (!s) return "—";
  // Una fecha sin hora se interpreta en UTC y se desplazaría un día al
  // mostrarla en la zona local, así que se formatea tal cual viene.
  const soloFecha = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d)) return s;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
export function fmtFechaHora(s) {
  if (!s) return "—";
  const conHora = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (conHora) return `${conHora[3]}/${conHora[2]}/${conHora[1]} ${conHora[4]}:${conHora[5]}`;
  return fmtFecha(s);
}
export function fmtTam(b) {
  if (!b) return "—";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}
export function iniciales(nombre) {
  return String(nombre || "?").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const EXT_KIND = { pdf: "pdf", xls: "xls", xlsx: "xls", csv: "xls", doc: "doc", docx: "doc", ppt: "ppt", pptx: "ppt", png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", svg: "img", zip: "zip", rar: "zip", "7z": "zip" };
const KIND_ICON = { pdf: FileText, xls: FileSpreadsheet, doc: FileText, ppt: Presentation, img: FileImage, zip: FileArchive, otro: FileText };

export function tipoArchivo(nombre) {
  const m = String(nombre || "").match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase() : "—";
}
export function IconoArchivo({ nombre, size = 16 }) {
  const kind = EXT_KIND[tipoArchivo(nombre).toLowerCase()] || "otro";
  const I = KIND_ICON[kind];
  return <span className={`gc-fico ${kind}`}><I size={size} /></span>;
}

/* ---------- Estados ---------- */

// Un único catálogo de estados para todo el módulo: color y etiqueta.
const ESTADOS = {
  // contrato
  activo: ["ok", "Activo"], finalizado: ["muted", "Finalizado"], suspendido: ["warn", "Suspendido"], archivado: ["muted", "Archivado"],
  // actividades
  draft: ["muted", "Borrador"], submitted: ["info", "Presentada"], in_review: ["warn", "En revisión"],
  approved: ["ok", "Aprobada"], rejected: ["danger", "Rechazada"], needs_changes: ["warn", "Requiere ajustes"],
  // evidencias
  pendiente: ["muted", "Pendiente"], cargada: ["info", "Cargada"], validada: ["ok", "Validada"],
  rechazada: ["danger", "Rechazada"], requiere_ajuste: ["warn", "Requiere ajuste"], vencida: ["danger", "Vencida"],
  // entregas y solicitudes
  enviado: ["info", "Por revisar"], aprobado: ["ok", "Aprobado"], rechazado: ["danger", "Rechazado"],
  // informes
  borrador: ["muted", "Borrador"], en_revision: ["warn", "En revisión"], requiere_ajustes: ["warn", "Requiere ajustes"],
  // periodos
  abierto: ["info", "Abierto"], cerrado: ["muted", "Cerrado"],
};

export function Estado({ valor, children }) {
  const [tono, texto] = ESTADOS[valor] || ["muted", valor || "—"];
  return <span className={`gc-badge ${tono}`}>{children}{texto}</span>;
}
export function etiquetaEstado(valor) {
  return (ESTADOS[valor] || [null, valor || "—"])[1];
}

/* ---------- Piezas de interfaz ---------- */

export function Vacio({ icono: Icono = Inbox, titulo, texto, accion }) {
  return (
    <div className="gc-empty">
      <div className="ico"><Icono size={22} /></div>
      <h3>{titulo}</h3>
      {texto && <p>{texto}</p>}
      {accion}
    </div>
  );
}

export function Cargando({ filas = 4 }) {
  return <div>{Array.from({ length: filas }, (_, i) => <div className="gc-skel row" key={i} />)}</div>;
}

export function Anillo({ valor, total, size = 74 }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <div className="gc-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(123,92,250,.14)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#gcgrad)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} style={{ transition: "stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)" }} />
        <defs>
          <linearGradient id="gcgrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4a67ff" /><stop offset="100%" stopColor="#1fc4dc" />
          </linearGradient>
        </defs>
      </svg>
      <span>{pct}%</span>
    </div>
  );
}

export function Drawer({ abierto, titulo, subtitulo, onClose, children, pie }) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [abierto, onClose]);
  if (!abierto) return null;
  return (
    <>
      <div className="gc-overlay" onClick={onClose} />
      <aside className="gc-drawer" role="dialog" aria-label={titulo}>
        <header className="gc-drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{titulo}</h3>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button className="gc-icbtn" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </header>
        <div className="gc-drawer-body">{children}</div>
        {pie && <footer className="gc-drawer-foot">{pie}</footer>}
      </aside>
    </>
  );
}

// Confirmación de acciones críticas; admite pedir un motivo obligatorio.
export function Confirmar({ abierto, titulo, texto, etiqueta = "Confirmar", tono = "danger", pedirMotivo, onClose, onConfirmar }) {
  const [motivo, setMotivo] = useState("");
  useEffect(() => { if (abierto) setMotivo(""); }, [abierto]);
  if (!abierto) return null;
  const faltaMotivo = pedirMotivo && !motivo.trim();
  return (
    <>
      <div className="gc-overlay" onClick={onClose} />
      <div className="gc-modal" role="dialog">
        <h3>{titulo}</h3>
        {texto && <p>{texto}</p>}
        {pedirMotivo && (
          <textarea autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Explica qué se debe corregir…" />
        )}
        <div className="gc-modal-foot">
          <button className="gc-btn ghost" onClick={onClose}>Cancelar</button>
          <button className={`gc-btn ${tono}`} disabled={faltaMotivo} onClick={() => onConfirmar(motivo.trim())}>{etiqueta}</button>
        </div>
      </div>
    </>
  );
}

// Visor embebido: todo documento se consulta dentro del sistema.
export function Visor({ item, onClose }) {
  if (!item) return null;
  const nombre = item.file_name || item.titulo || "Archivo";
  const mime = item.mime_type || "";
  const clase = mime.includes("pdf") || /\.pdf$/i.test(nombre) ? "pdf"
    : mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(nombre) ? "img"
    : "otro";
  const url = item.url;
  const descarga = url + (url.includes("?") ? "&" : "?") + "download=1";
  return (
    <div className="gc-viewer" onClick={onClose}>
      <div className="gc-viewer-box" onClick={(e) => e.stopPropagation()}>
        <aside className="gc-viewer-side">
          <IconoArchivo nombre={nombre} size={20} />
          <h3>{item.titulo || nombre}</h3>
          {[["Archivo", nombre], ["Tipo", tipoArchivo(nombre)], ["Tamaño", fmtTam(item.size_bytes)],
            ["Cargado por", item.autor || "—"], ["Fecha", item.fecha || "—"], ["Contexto", item.contexto || "—"]]
            .map(([k, v]) => <div className="gc-viewer-row" key={k}><span>{k}</span><b>{v}</b></div>)}
          {item.observaciones && (
            <div style={{ fontSize: 12, color: "var(--gc-soft)", lineHeight: 1.5, paddingTop: 8 }}>
              <b style={{ display: "block", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gc-muted)", marginBottom: 4 }}>Observaciones</b>
              {item.observaciones}
            </div>
          )}
          <a className="gc-btn primary" href={descarga} download={nombre} style={{ marginTop: "auto", justifyContent: "center" }}>
            <Download size={15} /> Descargar
          </a>
        </aside>
        <main className="gc-viewer-main">
          <button className="gc-viewer-close" onClick={onClose} aria-label="Cerrar"><X size={17} /></button>
          {clase === "img" ? <img src={url} alt={nombre} />
            : clase === "pdf" ? <iframe src={url} title={nombre} />
            : (
              <div className="gc-viewer-none">
                <FileSpreadsheet size={44} />
                <div>
                  <h3 style={{ margin: "0 0 5px", color: "var(--gc-ink)", fontFamily: "'Bricolage Grotesque'" }}>Vista previa no disponible</h3>
                  <p style={{ margin: 0, fontSize: 12.5 }}>Este formato se consulta descargándolo.</p>
                </div>
                <a className="gc-btn primary" href={descarga} download={nombre}><Download size={15} /> Descargar</a>
              </div>
            )}
        </main>
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`gc-toast ${toast.tipo === "error" ? "error" : ""}`}>
      {toast.tipo === "error" ? <AlertCircle size={16} /> : <Check size={16} />} {toast.msg}
    </div>
  );
}
