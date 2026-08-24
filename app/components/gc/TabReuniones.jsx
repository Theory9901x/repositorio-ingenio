"use client";

import { useCallback, useState } from "react";
import {
  CalendarDays, ClipboardCheck, Download, Eye, FileText, MapPin, Paperclip, Plus, Trash2, Upload, Users,
} from "lucide-react";
import { api, enviarForm, enviarJson, urlArchivo } from "./api";
import { invalidar, useDatos } from "./cache";
import { Cargando, Confirmar, Drawer, IconoArchivo, Vacio, fmtFecha, fmtTam } from "./ui";

// Reuniones del contrato: cada una es una carpeta fechada con su acta,
// su lista de asistencia y los soportes que haga falta anexar.

const RANURAS = [
  { kind: "acta", etiqueta: "Acta de reunión", Icono: FileText },
  { kind: "asistencia", etiqueta: "Lista de asistencia", Icono: Users },
];

export default function TabReuniones({ contratoId, detalle, avisar, setVisor }) {
  const [drawerAlta, setDrawerAlta] = useState(null);
  const [subiendo, setSubiendo] = useState(null); // { reunion, kind } mientras sube
  const [confirmar, setConfirmar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const url = `/api/gc/contracts/${contratoId}/meetings`;
  const { datos: reuniones, refrescar } = useDatos(url, { onError: (e) => avisar(e.message, "error") });

  const cargar = useCallback(() => { invalidar(url); return refrescar(); }, [url, refrescar]);

  const puedeGestionar = detalle.permisos.includes("DOCUMENT_UPLOAD");
  const puedeEliminar = detalle.rol !== "TRABAJADOR";

  async function crearReunion() {
    setGuardando(true);
    try {
      await enviarJson(url, "POST", drawerAlta);
      avisar("Reunión creada");
      setDrawerAlta(null);
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function subir(reunion, kind, archivo) {
    if (!archivo) return;
    setSubiendo({ id: reunion.id, kind });
    try {
      const fd = new FormData();
      fd.set("meetingId", reunion.id);
      fd.set("kind", kind);
      fd.set("file", archivo);
      await enviarForm(url, "PUT", fd);
      avisar(kind === "acta" ? "Acta anexada" : kind === "asistencia" ? "Asistencia anexada" : "Anexo agregado");
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setSubiendo(null); }
  }

  async function eliminar() {
    const c = confirmar;
    setConfirmar(null);
    try {
      const query = c.tipo === "archivo" ? `fileId=${c.id}` : `meetingId=${c.id}`;
      await api(`${url}?${query}`, { method: "DELETE" });
      avisar(c.tipo === "archivo" ? "Archivo retirado" : "Reunión eliminada");
      cargar();
    } catch (e) { avisar(e.message, "error"); }
  }

  function ver(reunion, archivo) {
    setVisor({
      url: urlArchivo("reunion", archivo.id), file_name: archivo.file_name, titulo: archivo.file_name,
      mime_type: archivo.mime_type, size_bytes: archivo.size_bytes,
      autor: archivo.uploaded_by_name, fecha: archivo.created_at,
      contexto: `Reunión · ${reunion.title} · ${fmtFecha(reunion.meeting_date)}`,
    });
  }

  if (!reuniones) return <section className="gc-card"><Cargando filas={4} /></section>;

  // Agrupadas por mes, de la más reciente a la más antigua.
  const meses = [];
  for (const r of reuniones) {
    const clave = r.meeting_date.slice(0, 7);
    let grupo = meses.find((m) => m.clave === clave);
    if (!grupo) { grupo = { clave, items: [] }; meses.push(grupo); }
    grupo.items.push(r);
  }
  const nombreMes = (clave) => {
    const [y, m] = clave.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  };

  return (
    <>
      <section className="gc-card flush">
        <header className="gc-card-title" style={{ padding: "16px 18px 0", margin: 0 }}>
          <h3>Reuniones del contrato</h3>
          {puedeGestionar && (
            <button className="gc-btn primary" onClick={() => setDrawerAlta({ meeting_date: new Date().toISOString().slice(0, 10) })}>
              <Plus size={15} /> Nueva reunión
            </button>
          )}
        </header>

        {!reuniones.length ? (
          <div style={{ padding: "10px 18px 24px" }}>
            <Vacio icono={CalendarDays} titulo="Todavía no hay reuniones"
              texto="Crea la primera reunión con su fecha y anexa el acta y la lista de asistencia."
              accion={puedeGestionar && (
                <button className="gc-btn primary" onClick={() => setDrawerAlta({ meeting_date: new Date().toISOString().slice(0, 10) })}>
                  <Plus size={15} /> Crear reunión
                </button>
              )} />
          </div>
        ) : (
          <div style={{ padding: "6px 18px 22px", display: "grid", gap: 20 }}>
            {meses.map((mes) => (
              <div key={mes.clave}>
                <div className="gc-reunion-mes">{nombreMes(mes.clave)}</div>
                <div className="gc-reuniones">
                  {mes.items.map((r) => {
                    const anexos = r.archivos.filter((a) => a.kind === "anexo");
                    return (
                      <article className="gc-reunion" key={r.id}>
                        <header>
                          <span className="gc-reunion-fecha">
                            <b>{Number(r.meeting_date.slice(8, 10))}</b>
                            <small>{fmtFecha(r.meeting_date)}</small>
                          </span>
                          <div className="gc-reunion-titulo">
                            <b>{r.title}</b>
                            <small>
                              {r.location && <><MapPin size={11} /> {r.location} · </>}
                              {r.created_by_name || "—"}
                            </small>
                          </div>
                          {puedeEliminar && (
                            <button className="gc-icbtn danger" title="Eliminar reunión"
                              onClick={() => setConfirmar({ tipo: "reunion", id: r.id, titulo: r.title })}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </header>
                        {r.description && <p className="gc-reunion-desc">{r.description}</p>}

                        {/* Acta y asistencia: una ranura fija para cada una */}
                        <div className="gc-reunion-ranuras">
                          {RANURAS.map(({ kind, etiqueta, Icono }) => {
                            const archivo = r.archivos.find((a) => a.kind === kind);
                            const ocupado = subiendo?.id === r.id && subiendo?.kind === kind;
                            return (
                              <div className={`gc-ranura${archivo ? " llena" : ""}`} key={kind}>
                                <span className="gc-ranura-ico"><Icono size={15} /></span>
                                <span className="txt">
                                  <b>{etiqueta}</b>
                                  {archivo
                                    ? <small>{archivo.file_name} · {fmtTam(archivo.size_bytes)}</small>
                                    : <small>Sin anexar</small>}
                                </span>
                                <div className="gc-rowact">
                                  {archivo && (
                                    <>
                                      <button className="gc-icbtn" title="Ver" onClick={() => ver(r, archivo)}><Eye size={14} /></button>
                                      <a className="gc-icbtn" title="Descargar" href={`${urlArchivo("reunion", archivo.id)}&download=1`}><Download size={14} /></a>
                                    </>
                                  )}
                                  {puedeGestionar && (
                                    <label className="gc-icbtn" title={archivo ? "Reemplazar" : "Anexar"} style={{ cursor: "pointer" }}>
                                      {ocupado ? <ClipboardCheck size={14} /> : <Upload size={14} />}
                                      <input type="file" hidden disabled={!!ocupado}
                                        onChange={(e) => { subir(r, kind, e.target.files?.[0]); e.target.value = ""; }} />
                                    </label>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Otros soportes de la reunión */}
                        {(anexos.length > 0 || puedeGestionar) && (
                          <div className="gc-reunion-anexos">
                            {anexos.map((a) => (
                              <div className="gc-item" key={a.id} style={{ cursor: "default" }}>
                                <IconoArchivo nombre={a.file_name} />
                                <span className="txt">
                                  <b>{a.file_name}</b>
                                  <small>{fmtTam(a.size_bytes)} · {a.uploaded_by_name || "—"}</small>
                                </span>
                                <div className="gc-rowact">
                                  <button className="gc-icbtn" title="Ver" onClick={() => ver(r, a)}><Eye size={14} /></button>
                                  <button className="gc-icbtn danger" title="Retirar"
                                    onClick={() => setConfirmar({ tipo: "archivo", id: a.id, titulo: a.file_name })}>
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {puedeGestionar && (
                              <label className="gc-reunion-agregar">
                                <Paperclip size={13} /> {subiendo?.id === r.id && subiendo?.kind === "anexo" ? "Subiendo…" : "Agregar otro soporte"}
                                <input type="file" hidden disabled={subiendo?.id === r.id}
                                  onChange={(e) => { subir(r, "anexo", e.target.files?.[0]); e.target.value = ""; }} />
                              </label>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Alta de reunión */}
      <Drawer abierto={!!drawerAlta} titulo="Nueva reunión"
        subtitulo="Se crea como una carpeta fechada a la que luego anexas el acta y la asistencia."
        onClose={() => setDrawerAlta(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawerAlta(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !drawerAlta?.title?.trim() || !drawerAlta?.meeting_date} onClick={crearReunion}>
            {guardando ? "Creando…" : "Crear reunión"}
          </button>
        </>}>
        {drawerAlta && (
          <div className="gc-form c2">
            <div className="gc-field gc-full">
              <label>Asunto *</label>
              <input value={drawerAlta.title || ""} onChange={(e) => setDrawerAlta({ ...drawerAlta, title: e.target.value })}
                placeholder="Comité de seguimiento mensual" autoFocus />
            </div>
            <div className="gc-field">
              <label>Fecha *</label>
              <input type="date" value={drawerAlta.meeting_date || ""} onChange={(e) => setDrawerAlta({ ...drawerAlta, meeting_date: e.target.value })} />
            </div>
            <div className="gc-field">
              <label>Lugar</label>
              <input value={drawerAlta.location || ""} onChange={(e) => setDrawerAlta({ ...drawerAlta, location: e.target.value })}
                placeholder="Sala de juntas / virtual" />
            </div>
            <div className="gc-field gc-full">
              <label>Descripción</label>
              <textarea rows={3} value={drawerAlta.description || ""} onChange={(e) => setDrawerAlta({ ...drawerAlta, description: e.target.value })}
                placeholder="Temas tratados, acuerdos, compromisos…" />
            </div>
          </div>
        )}
      </Drawer>

      <Confirmar abierto={!!confirmar}
        titulo={confirmar?.tipo === "archivo" ? "Retirar archivo" : "Eliminar reunión"}
        texto={confirmar?.tipo === "archivo"
          ? `Se retirará «${confirmar?.titulo}» de la reunión.`
          : `Se eliminará la reunión «${confirmar?.titulo}» con su acta, asistencia y anexos.`}
        etiqueta={confirmar?.tipo === "archivo" ? "Retirar" : "Eliminar"}
        onClose={() => setConfirmar(null)} onConfirmar={eliminar} />
    </>
  );
}
