"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Trash2, Upload } from "lucide-react";
import { api, enviarForm, urlArchivo } from "./api";
import { Cargando, Confirmar, Drawer, IconoArchivo, Vacio, fmtFechaHora, fmtTam, tipoArchivo } from "./ui";

const SECCIONES = [
  ["contratacion", "Documentos contractuales"], ["cronograma", "Cronograma"], ["plan_trabajo", "Plan de trabajo"],
  ["acta", "Actas"], ["formato", "Formatos"], ["cuenta_cobro", "Soportes de cuenta"],
  ["ejecucion", "Soportes de ejecución"], ["soporte", "Otros soportes"],
];
const COLUMNAS = "minmax(0,1fr) 150px 90px 130px 120px";

export default function TabDocumentos({ contratoId, detalle, avisar, setVisor }) {
  const [docs, setDocs] = useState(null);
  const [seccion, setSeccion] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState({ section: "soporte", title: "", description: "" });
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const input = useRef(null);

  const cargar = useCallback(async () => {
    try { setDocs(await api(`/api/gc/contracts/${contratoId}/documents`)); }
    catch (e) { avisar(e.message, "error"); setDocs([]); }
  }, [contratoId, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  async function subir() {
    if (!archivo) return avisar("Selecciona un archivo", "error");
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.set("section", form.section);
      fd.set("title", form.title || archivo.name);
      fd.set("description", form.description || "");
      fd.set("file", archivo);
      await enviarForm(`/api/gc/contracts/${contratoId}/documents`, "POST", fd);
      avisar("Documento cargado");
      setDrawer(false); setArchivo(null); setForm({ section: "soporte", title: "", description: "" });
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setSubiendo(false); }
  }

  async function eliminar(doc) {
    try {
      await api(`/api/gc/contracts/${contratoId}/documents?docId=${doc.id}`, { method: "DELETE" });
      avisar("Documento eliminado");
      setConfirmar(null); cargar();
    } catch (e) { avisar(e.message, "error"); setConfirmar(null); }
  }

  if (!docs) return <section className="gc-card"><Cargando filas={5} /></section>;

  const visibles = seccion ? docs.filter((d) => d.section === seccion) : docs;
  const puedeSubir = detalle.permisos.includes("DOCUMENT_UPLOAD");

  return (
    <>
      <section className="gc-card flush">
        <header className="gc-card-title" style={{ padding: "16px 18px 0", margin: 0 }}>
          <h3>Documentos del contrato</h3>
          <div className="gc-actions">
            <select className="gc-btn ghost" style={{ paddingRight: 10 }} value={seccion} onChange={(e) => setSeccion(e.target.value)}>
              <option value="">Todas las secciones</option>
              {SECCIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {puedeSubir && <button className="gc-btn primary" onClick={() => setDrawer(true)}><Upload size={15} /> Cargar documento</button>}
          </div>
        </header>

        {visibles.length ? (
          <div className="gc-table" style={{ marginTop: 14 }}>
            <div className="gc-thead" style={{ gridTemplateColumns: COLUMNAS }}>
              <span>Documento</span><span>Sección</span><span>Tipo</span><span>Fecha</span><span style={{ textAlign: "right" }}>Acciones</span>
            </div>
            {visibles.map((d) => (
              <div className="gc-trow click" key={d.id} style={{ gridTemplateColumns: COLUMNAS }}
                onClick={() => setVisor({
                  url: urlArchivo("documento", d.id), file_name: d.file_name, titulo: d.title,
                  mime_type: d.mime_type, size_bytes: d.size_bytes, autor: d.uploaded_by_name,
                  fecha: fmtFechaHora(d.created_at), contexto: SECCIONES.find(([v]) => v === d.section)?.[1],
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
                  <a className="gc-icbtn" title="Descargar" href={urlArchivo("documento", d.id) + "&download=1"} download={d.file_name}><Download size={14} /></a>
                  <button className="gc-icbtn danger" title="Eliminar" onClick={() => setConfirmar(d)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            <Vacio icono={FileText} titulo={seccion ? "No hay documentos en esta sección" : "Aún no hay documentos cargados"}
              texto="Carga los soportes contractuales para tenerlos disponibles dentro del sistema."
              accion={puedeSubir && <button className="gc-btn primary" onClick={() => setDrawer(true)}><Upload size={15} /> Cargar documento</button>} />
          </div>
        )}
      </section>

      <Drawer abierto={drawer} titulo="Cargar documento" subtitulo="El archivo queda asociado a este contrato."
        onClose={() => setDrawer(false)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawer(false)}>Cancelar</button>
          <button className="gc-btn primary" disabled={subiendo || !archivo} onClick={subir}>{subiendo ? "Cargando…" : "Cargar documento"}</button>
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
            <label>Archivo *</label>
            <input ref={input} type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            {archivo && <span className="hint">{archivo.name} · {fmtTam(archivo.size)}</span>}
          </div>
        </div>
      </Drawer>

      <Confirmar abierto={!!confirmar} titulo="Eliminar documento"
        texto={`Se eliminará «${confirmar?.title}» y su archivo. Esta acción es permanente.`}
        etiqueta="Eliminar" onClose={() => setConfirmar(null)} onConfirmar={() => eliminar(confirmar)} />
    </>
  );
}
