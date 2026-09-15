"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Camera, ChevronDown, ChevronRight, Download, FileText, Folder, FolderOpen, FolderPlus,
  Home, MoveRight, Pencil, Trash2, Upload,
} from "lucide-react";
import { api, enviarForm, enviarJson, urlArchivo } from "./api";
import { prepararArchivo } from "./imagen";
import { invalidar, useDatos } from "./cache";
import { BotonExportar, Cargando, Confirmar, Drawer, IconoArchivo, Vacio, fmtFechaHora, fmtTam, tipoArchivo } from "./ui";

const SECCIONES = [
  ["contratacion", "Documentos contractuales"], ["cronograma", "Cronograma"], ["plan_trabajo", "Plan de trabajo"],
  ["acta", "Actas"], ["formato", "Formatos"], ["cuenta_cobro", "Soportes de cuenta"],
  ["ejecucion", "Soportes de ejecución"], ["evidencia", "Evidencias"],
  ["notificacion", "Notificaciones"], ["soporte", "Otros soportes"],
];
const COLUMNAS = "minmax(0,1fr) 140px 80px 120px 110px";

// El mismo explorador sirve a dos espacios: los documentos del contrato
// (ambito "documentos") y las evidencias generales (ambito "evidencias"),
// un espacio comun donde cualquiera del contrato consulta y carga.
export default function TabDocumentos({ contratoId, detalle, avisar, setVisor, ambito = "documentos" }) {
  const esEvidencias = ambito === "evidencias";
  const cosa = esEvidencias ? "evidencia" : "documento";
  const [carpeta, setCarpeta] = useState(null);   // carpeta abierta (null = raíz)
  const [abiertas, setAbiertas] = useState({});
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState(() => ({ section: ambito === "evidencias" ? "evidencia" : "soporte", title: "", description: "" }));
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [modalCarpeta, setModalCarpeta] = useState(null);
  const [nombreCarpeta, setNombreCarpeta] = useState("");
  const [moviendo, setMoviendo] = useState(null);
  const [progreso, setProgreso] = useState(null); // "2 de 5" durante la carga rapida
  const input = useRef(null);

  const { datos: docsRaw, refrescar: refDocs } = useDatos(
    `/api/gc/contracts/${contratoId}/documents?ambito=${ambito}`, { onError: (e) => avisar(e.message, "error") });
  const { datos: carpetasRaw, refrescar: refCarpetas } = useDatos(
    `/api/gc/contracts/${contratoId}/folders?ambito=${ambito}`, { onError: (e) => avisar(e.message, "error") });
  // Si el servidor devolviera algo que no es una lista, la pestaña no debe romperse.
  const docs = Array.isArray(docsRaw) ? docsRaw : docsRaw ? [] : null;
  const carpetas = Array.isArray(carpetasRaw) ? carpetasRaw : carpetasRaw ? [] : null;

  const cargar = useCallback(() => {
    invalidar(`/api/gc/contracts/${contratoId}/`);
    return Promise.all([refDocs(), refCarpetas()]);
  }, [contratoId, refDocs, refCarpetas]);

  /* ---------- Carpetas ---------- */
  const hijasDe = useCallback((padre) => (carpetas || []).filter((c) => (c.parent_id || null) === padre), [carpetas]);
  const carpetaPorId = useCallback((id) => (carpetas || []).find((c) => c.id === id), [carpetas]);

  // Ruta desde la raíz hasta la carpeta abierta.
  const ruta = useMemo(() => {
    const camino = [];
    let actual = carpeta;
    const vistos = new Set();
    while (actual && !vistos.has(actual)) {
      vistos.add(actual);
      const c = carpetaPorId(actual);
      if (!c) break;
      camino.unshift(c);
      actual = c.parent_id || null;
    }
    return camino;
  }, [carpeta, carpetaPorId]);

  async function guardarCarpeta() {
    const nombre = nombreCarpeta.trim();
    if (!nombre) return;
    try {
      if (modalCarpeta.tipo === "renombrar") {
        await enviarJson(`/api/gc/contracts/${contratoId}/folders`, "PUT", { id: modalCarpeta.id, name: nombre });
        avisar("Carpeta renombrada");
      } else {
        await enviarJson(`/api/gc/contracts/${contratoId}/folders`, "POST", { name: nombre, parent_id: modalCarpeta.parentId, ambito });
        avisar("Carpeta creada");
      }
      setModalCarpeta(null); setNombreCarpeta(""); cargar();
    } catch (e) { avisar(e.message, "error"); }
  }

  async function eliminarCarpeta(c) {
    try {
      await api(`/api/gc/contracts/${contratoId}/folders?folderId=${c.id}`, { method: "DELETE" });
      avisar("Carpeta eliminada");
      if (carpeta === c.id) setCarpeta(c.parent_id || null);
      setConfirmar(null); cargar();
    } catch (e) { avisar(e.message, "error"); setConfirmar(null); }
  }

  /* ---------- Documentos ---------- */
  // Sube una tanda de archivos a la carpeta abierta. Las fotos se comprimen
  // en el dispositivo antes de viajar: es lo que hace viable cargar desde el
  // celular con datos moviles.
  async function subirLote(archivos, extras = {}) {
    const lista = [...archivos].filter(Boolean);
    if (!lista.length) return;
    setSubiendo(true);
    let subidos = 0;
    try {
      for (let i = 0; i < lista.length; i++) {
        setProgreso(lista.length > 1 ? `${i + 1} de ${lista.length}` : null);
        const listo = await prepararArchivo(lista[i]);
        const fd = new FormData();
        fd.set("ambito", ambito);
        fd.set("section", extras.section || (esEvidencias ? "evidencia" : "soporte"));
        fd.set("title", (lista.length === 1 && extras.title) || listo.name);
        if (extras.description) fd.set("description", extras.description);
        if (carpeta) fd.set("folderId", carpeta);
        fd.set("file", listo);
        await enviarForm(`/api/gc/contracts/${contratoId}/documents`, "POST", fd);
        subidos++;
      }
      avisar(subidos === 1
        ? (carpeta ? `Cargado en «${carpetaPorId(carpeta)?.name}»` : `${esEvidencias ? "Evidencia cargada" : "Documento cargado"}`)
        : `${subidos} archivo(s) cargados`);
      cargar();
    } catch (e) {
      avisar(subidos ? `${e.message} (se cargaron ${subidos} de ${lista.length})` : e.message, "error");
      if (subidos) cargar();
    } finally { setSubiendo(false); setProgreso(null); }
  }

  async function subir() {
    if (!archivo?.length) return avisar("Selecciona al menos un archivo", "error");
    await subirLote(archivo, form);
    setDrawer(false); setArchivo(null); setForm({ section: esEvidencias ? "evidencia" : "soporte", title: "", description: "" });
  }

  async function mover(doc, destino) {
    try {
      await enviarJson(`/api/gc/contracts/${contratoId}/documents`, "PUT", { docId: doc.id, folder_id: destino });
      avisar(destino ? `Movido a «${carpetaPorId(destino)?.name}»` : "Movido a documentos sin carpeta");
      setMoviendo(null); cargar();
    } catch (e) { avisar(e.message, "error"); setMoviendo(null); }
  }

  async function eliminar(doc) {
    try {
      await api(`/api/gc/contracts/${contratoId}/documents?docId=${doc.id}`, { method: "DELETE" });
      avisar("Documento eliminado");
      setConfirmar(null); cargar();
    } catch (e) { avisar(e.message, "error"); setConfirmar(null); }
  }

  if (!docs || !carpetas) return <section className="gc-card"><Cargando filas={5} /></section>;

  const puedeSubir = detalle.permisos.includes("DOCUMENT_UPLOAD");
  const puedeBorrarCarpeta = detalle.rol !== "TRABAJADOR";
  const puedeBorrarDoc = (d) => detalle.rol !== "TRABAJADOR" || Number(d.uploaded_by) === Number(detalle.yo.id);
  const enCarpeta = docs.filter((d) => (d.folder_id || null) === carpeta);
  const subcarpetas = hijasDe(carpeta);
  const sinCarpeta = docs.filter((d) => !d.folder_id).length;

  // Documentos de una carpeta contando los de sus subcarpetas.
  const totalRecursivo = (id) => {
    let n = docs.filter((d) => d.folder_id === id).length;
    for (const h of hijasDe(id)) n += totalRecursivo(h.id);
    return n;
  };

  function Rama({ c, nivel = 0 }) {
    const hijas = hijasDe(c.id);
    const abierta = abiertas[c.id] !== false;
    return (
      <div key={c.id}>
        <div className={`gc-tree-row ${carpeta === c.id ? "on" : ""}`} style={{ paddingLeft: 8 + nivel * 14 }}
          onClick={() => setCarpeta(c.id)}>
          <button className="gc-tree-caret" onClick={(e) => { e.stopPropagation(); setAbiertas({ ...abiertas, [c.id]: !abierta }); }}>
            {hijas.length ? (abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <i />}
          </button>
          {carpeta === c.id ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span className="gc-tree-name">{c.name}</span>
          <span className="gc-tree-count">{totalRecursivo(c.id)}</span>
          {puedeSubir && (
            <span className="gc-tree-act" onClick={(e) => e.stopPropagation()}>
              <button title="Subcarpeta" onClick={() => { setModalCarpeta({ tipo: "nueva", parentId: c.id }); setNombreCarpeta(""); }}><FolderPlus size={12} /></button>
              <button title="Renombrar" onClick={() => { setModalCarpeta({ tipo: "renombrar", id: c.id }); setNombreCarpeta(c.name); }}><Pencil size={12} /></button>
              {puedeBorrarCarpeta && <button title="Eliminar" onClick={() => setConfirmar({ tipo: "carpeta", ...c })}><Trash2 size={12} /></button>}
            </span>
          )}
        </div>
        {abierta && hijas.map((h) => <Rama key={h.id} c={h} nivel={nivel + 1} />)}
      </div>
    );
  }

  return (
    <>
      <div className="gc-split">
        {/* Árbol de carpetas (en móvil se navega por las tarjetas) */}
        <section className="gc-card gc-arbol">
          <header className="gc-card-title">
            <h3>{esEvidencias ? "Carpetas de evidencias" : "Carpetas"}</h3>
            {puedeSubir && (
              <button className="gc-addfolder" title="Nueva carpeta"
                onClick={() => { setModalCarpeta({ tipo: "nueva", parentId: null }); setNombreCarpeta(""); }}>
                <FolderPlus size={15} />
              </button>
            )}
          </header>
          <div className="gc-tree">
            <div className={`gc-tree-row ${carpeta === null ? "on" : ""}`} onClick={() => setCarpeta(null)}>
              <span className="gc-tree-caret"><i /></span>
              <Home size={15} />
              <span className="gc-tree-name">{esEvidencias ? "Todas las evidencias" : "Todos los documentos"}</span>
              <span className="gc-tree-count">{docs.length}</span>
            </div>
            {hijasDe(null).map((c) => <Rama key={c.id} c={c} />)}
          </div>
          <footer className="gc-tree-foot">
            <Folder size={13} /> {carpetas.length} carpeta(s) · {sinCarpeta} sin clasificar
          </footer>
        </section>

        {/* Contenido de la carpeta abierta */}
        <section className="gc-card flush">
          <header className="gc-explorer-head">
            <nav className="gc-crumb">
              <button onClick={() => setCarpeta(null)}><Home size={13} /> {esEvidencias ? "Evidencias generales" : "Documentos"}</button>
              {ruta.map((c, i) => (
                <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <ChevronRight size={12} />
                  <button className={i === ruta.length - 1 ? "here" : ""} onClick={() => setCarpeta(c.id)}>{c.name}</button>
                </span>
              ))}
            </nav>
            <div className="gc-explorer-actions">
              <BotonExportar contratoId={contratoId} seccion="documentos" filtros={{ carpeta: carpeta || "", ambito }} />
              {puedeSubir && (
                <button className="gc-chip" onClick={() => { setModalCarpeta({ tipo: "nueva", parentId: carpeta }); setNombreCarpeta(""); }}>
                  <FolderPlus size={14} /> Nueva carpeta
                </button>
              )}
            </div>
          </header>

          {/* Carga rápida: dos toques desde el celular, directo a la carpeta
              abierta. La foto sale de la cámara ya comprimida. */}
          {puedeSubir && (
            <div className="gc-cargarapida">
              <label className={`gc-btn primary${subiendo ? " off" : ""}`}>
                <Camera size={16} /> {progreso ? `Subiendo ${progreso}…` : subiendo ? "Subiendo…" : "Tomar foto"}
                <input type="file" accept="image/*" capture="environment" hidden disabled={subiendo}
                  onChange={(e) => { subirLote(e.target.files); e.target.value = ""; }} />
              </label>
              <label className={`gc-btn ghost${subiendo ? " off" : ""}`}>
                <Upload size={16} /> Subir archivos
                <input type="file" multiple hidden disabled={subiendo}
                  onChange={(e) => { subirLote(e.target.files); e.target.value = ""; }} />
              </label>
              <button className="gc-btn ghost" disabled={subiendo} onClick={() => setDrawer(true)}>
                <FileText size={16} /> Con detalle
              </button>
            </div>
          )}

          {subcarpetas.length > 0 && (
            <>
              <p className="gc-explorer-sub">Subcarpetas</p>
              <div className="gc-foldergrid" style={{ padding: "0 18px 6px" }}>
                {subcarpetas.map((c) => (
                  <button className="gc-foldercard" key={c.id} onClick={() => setCarpeta(c.id)}>
                    <span className="ico"><Folder size={18} /></span>
                    <b>{c.name}</b>
                    <span>{totalRecursivo(c.id)} documento(s) · {hijasDe(c.id).length} subcarpeta(s)</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="gc-explorer-sub">
            {carpeta ? `${esEvidencias ? "Evidencias" : "Documentos"} en «${carpetaPorId(carpeta)?.name}»` : `${esEvidencias ? "Evidencias" : "Documentos"} sin clasificar`}
          </p>

          {enCarpeta.length ? (
            <div className="gc-table">
              <div className="gc-thead" style={{ gridTemplateColumns: COLUMNAS }}>
                <span>Documento</span><span>Sección</span><span>Tipo</span><span>Fecha</span><span style={{ textAlign: "right" }}>Acciones</span>
              </div>
              {enCarpeta.map((d) => (
                <div className="gc-trow click" key={d.id} style={{ gridTemplateColumns: COLUMNAS }}
                  onClick={() => setVisor({
                    url: urlArchivo("documento", d.id), file_name: d.file_name, titulo: d.title,
                    mime_type: d.mime_type, size_bytes: d.size_bytes, autor: d.uploaded_by_name,
                    fecha: fmtFechaHora(d.created_at),
                    contexto: ruta.length ? ruta.map((c) => c.name).join(" / ") : "Sin carpeta",
                    observaciones: d.description,
                  })}>
                  <div className="gc-cell-main">
                    <IconoArchivo nombre={d.file_name} />
                    <div style={{ minWidth: 0 }}>
                      <b>{d.title}</b>
                      <small>{d.owner_name ? `De ${d.owner_name}` : `Cargado por ${d.uploaded_by_name || "—"}`} · {fmtTam(d.size_bytes)}</small>
                    </div>
                  </div>
                  <span className="gc-cell">{SECCIONES.find(([v]) => v === d.section)?.[1] || d.section}</span>
                  <span className="gc-cell">{tipoArchivo(d.file_name)}</span>
                  <span className="gc-cell">{fmtFechaHora(d.created_at)}</span>
                  <div className="gc-rowact" onClick={(e) => e.stopPropagation()}>
                    {puedeSubir && carpetas.length > 0 && (
                      <button className="gc-icbtn" title="Mover a otra carpeta" onClick={() => setMoviendo(d)}><MoveRight size={14} /></button>
                    )}
                    <a className="gc-icbtn" title="Descargar" href={urlArchivo("documento", d.id) + "&download=1"} download={d.file_name}><Download size={14} /></a>
                    {puedeBorrarDoc(d) && (
                      <button className="gc-icbtn danger" title="Eliminar" onClick={() => setConfirmar({ tipo: "documento", ...d })}><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 18 }}>
              <Vacio icono={FileText}
                titulo={carpeta ? "Esta carpeta está vacía" : subcarpetas.length ? `No hay ${cosa}s sueltos` : `Aún no hay ${cosa}s cargadas`}
                texto={carpeta
                  ? `Carga ${cosa}s aquí o crea una subcarpeta para organizarlas mejor.`
                  : esEvidencias
                    ? "Espacio común del contrato: cualquiera del equipo puede crear carpetas y cargar evidencias aquí."
                    : "Organiza los soportes del contrato en carpetas para encontrarlos con facilidad."}
                accion={puedeSubir && (
                  <div className="gc-actions" style={{ justifyContent: "center" }}>
                    <label className="gc-btn primary">
                      <Upload size={15} /> Cargar {cosa}s
                      <input type="file" multiple hidden onChange={(e) => { subirLote(e.target.files); e.target.value = ""; }} />
                    </label>
                    <button className="gc-btn ghost" onClick={() => { setModalCarpeta({ tipo: "nueva", parentId: carpeta }); setNombreCarpeta(""); }}>
                      <FolderPlus size={15} /> Nueva carpeta
                    </button>
                  </div>
                )} />
            </div>
          )}
        </section>
      </div>

      {/* Cargar documento */}
      <Drawer abierto={drawer} titulo={esEvidencias ? "Cargar evidencia general" : "Cargar documento"}
        subtitulo={carpeta ? `Se guardará en «${carpetaPorId(carpeta)?.name}»` : "Se guardará sin carpeta"}
        onClose={() => setDrawer(false)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawer(false)}>Cancelar</button>
          <button className="gc-btn primary" disabled={subiendo || !archivo?.length} onClick={subir}>
            {subiendo ? (progreso ? `Cargando ${progreso}…` : "Cargando…") : `Cargar ${archivo?.length > 1 ? `${archivo.length} archivos` : cosa}`}
          </button>
        </>}>
        <div className="gc-form">
          <div className="gc-field">
            <label>Sección</label>
            <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
              {SECCIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="gc-field">
            <label>Título</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={archivo?.name || "Nombre del documento"} />
          </div>
          <div className="gc-field">
            <label>Descripción</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Contexto del documento…" />
          </div>
          <div className="gc-field">
            <label>Archivos *</label>
            <input ref={input} type="file" multiple onChange={(e) => setArchivo([...e.target.files])} />
            {archivo?.length === 1 && <span className="hint">{archivo[0].name} · {fmtTam(archivo[0].size)}</span>}
            {archivo?.length > 1 && <span className="hint">{archivo.length} archivos seleccionados{form.title ? " · el título aplica solo si es uno" : ""}</span>}
          </div>
        </div>
      </Drawer>

      {/* Mover documento de carpeta */}
      <Drawer abierto={!!moviendo} titulo="Mover documento" subtitulo={moviendo?.title}
        onClose={() => setMoviendo(null)}>
        <div style={{ display: "grid", gap: 7 }}>
          <button className="gc-item" onClick={() => mover(moviendo, null)}>
            <span className="ico"><Home size={16} /></span>
            <span className="txt"><b>Sin carpeta</b><small>Documentos sueltos del contrato</small></span>
          </button>
          {carpetas.map((c) => (
            <button className="gc-item" key={c.id} disabled={moviendo?.folder_id === c.id} onClick={() => mover(moviendo, c.id)}>
              <span className="ico"><Folder size={16} /></span>
              <span className="txt">
                <b>{c.name}</b>
                <small>{c.parent_id ? `Dentro de ${carpetaPorId(c.parent_id)?.name || "—"}` : "Carpeta principal"}</small>
              </span>
            </button>
          ))}
        </div>
      </Drawer>

      {/* Crear o renombrar carpeta */}
      {modalCarpeta && (
        <>
          <div className="gc-overlay" onClick={() => setModalCarpeta(null)} />
          <div className="gc-modal">
            <h3>{modalCarpeta.tipo === "renombrar" ? "Renombrar carpeta" : "Nueva carpeta"}</h3>
            <p>
              {modalCarpeta.tipo === "renombrar" ? "Escribe el nuevo nombre."
                : modalCarpeta.parentId ? `Se creará dentro de «${carpetaPorId(modalCarpeta.parentId)?.name}».`
                : esEvidencias ? "Se creará en el primer nivel de las evidencias generales."
                : "Se creará en el primer nivel de documentos del contrato."}
            </p>
            <input autoFocus value={nombreCarpeta} onChange={(e) => setNombreCarpeta(e.target.value)}
              placeholder="Contratación, Actas, Soportes de pago…"
              onKeyDown={(e) => { if (e.key === "Enter") guardarCarpeta(); }}
              style={{ width: "100%", border: "1px solid var(--gc-line)", borderRadius: 11, padding: "11px 13px", fontSize: 14, marginBottom: 16, outline: "none" }} />
            <div className="gc-modal-foot">
              <button className="gc-btn ghost" onClick={() => setModalCarpeta(null)}>Cancelar</button>
              <button className="gc-btn primary" disabled={!nombreCarpeta.trim()} onClick={guardarCarpeta}>
                {modalCarpeta.tipo === "renombrar" ? "Guardar" : "Crear carpeta"}
              </button>
            </div>
          </div>
        </>
      )}

      <Confirmar abierto={!!confirmar}
        titulo={confirmar?.tipo === "carpeta" ? "Eliminar carpeta" : "Eliminar documento"}
        texto={confirmar?.tipo === "carpeta"
          ? `Se eliminará la carpeta «${confirmar?.name}». Solo es posible si está vacía.`
          : `Se eliminará «${confirmar?.title}» y su archivo. Esta acción es permanente.`}
        etiqueta="Eliminar" onClose={() => setConfirmar(null)}
        onConfirmar={() => (confirmar.tipo === "carpeta" ? eliminarCarpeta(confirmar) : eliminar(confirmar))} />
    </>
  );
}
