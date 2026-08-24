"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Download, Eye, Inbox, Plus, Trash2, Upload, X } from "lucide-react";
import { api, enviarForm, enviarJson, urlArchivo } from "./api";
import { Cargando, Confirmar, Drawer, Estado, IconoArchivo, Vacio, fmtFecha, fmtFechaHora, fmtTam } from "./ui";

const COLUMNAS = "minmax(0,1fr) 150px 120px 130px 120px";

export default function TabSolicitudes({ contratoId, detalle, avisar, setVisor }) {
  const [datos, setDatos] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [drawerNueva, setDrawerNueva] = useState(null);
  const [drawerEntrega, setDrawerEntrega] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [revision, setRevision] = useState(null);

  const cargar = useCallback(async () => {
    try { setDatos(await api(`/api/gc/contracts/${contratoId}/requests`)); }
    catch (e) { avisar(e.message, "error"); setDatos({ solicitudes: [], entregas: [] }); }
  }, [contratoId, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  async function abrirNueva() {
    try { setParticipantes(await api(`/api/gc/contracts/${contratoId}/participants`)); } catch { setParticipantes([]); }
    setDrawerNueva({ section: "soporte", required: true });
  }

  async function crear() {
    setGuardando(true);
    try {
      await enviarJson(`/api/gc/contracts/${contratoId}/requests`, "POST", drawerNueva);
      avisar("Solicitud creada");
      setDrawerNueva(null); cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function entregar() {
    if (!archivo) return avisar("Selecciona el documento a entregar", "error");
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.set("requestId", drawerEntrega.id);
      fd.set("file", archivo);
      fd.set("comment", comentario);
      await enviarForm(`/api/gc/contracts/${contratoId}/requests`, "PUT", fd);
      avisar("Documento entregado. Queda en revisión.");
      setDrawerEntrega(null); setArchivo(null); setComentario(""); cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function revisar(entrega, accion, observacion) {
    try {
      await enviarJson(`/api/gc/submissions/${entrega.id}`, "PUT", { accion, observation: observacion });
      avisar(accion === "aprobar" ? "Entrega aprobada" : "Se solicitó la corrección");
      setRevision(null); cargar();
    } catch (e) { avisar(e.message, "error"); setRevision(null); }
  }

  async function eliminarSolicitud(s) {
    try {
      await api(`/api/gc/contracts/${contratoId}/requests?requestId=${s.id}`, { method: "DELETE" });
      avisar("Solicitud eliminada");
      setConfirmar(null); cargar();
    } catch (e) { avisar(e.message, "error"); setConfirmar(null); }
  }

  if (!datos) return <section className="gc-card"><Cargando filas={5} /></section>;

  const puedeCrear = detalle.permisos.includes("REQUEST_CREATE");
  const puedeResponder = detalle.permisos.includes("REQUEST_RESPOND");
  const esTrabajador = detalle.rol === "TRABAJADOR";
  const entregasDe = (reqId) => datos.entregas.filter((e) => e.request_id === reqId);

  return (
    <>
      <section className="gc-card flush">
        <header className="gc-card-title" style={{ padding: "16px 18px 0", margin: 0 }}>
          <h3>{esTrabajador ? "Documentos que me solicitaron" : "Solicitudes de documentos"}</h3>
          {puedeCrear && <button className="gc-btn primary" onClick={abrirNueva}><Plus size={15} /> Nueva solicitud</button>}
        </header>

        {datos.solicitudes.length ? (
          <div className="gc-table" style={{ marginTop: 14 }}>
            <div className="gc-thead" style={{ gridTemplateColumns: COLUMNAS }}>
              <span>Documento solicitado</span><span>Dirigido a</span><span>Fecha límite</span><span>Estado</span><span style={{ textAlign: "right" }}>Acciones</span>
            </div>
            {datos.solicitudes.map((s) => {
              const entregas = entregasDe(s.id);
              const estado = esTrabajador ? (s.mi_estado || "pendiente") : entregas.length ? entregas[0].status : "pendiente";
              const vencida = s.dias_restantes !== null && s.dias_restantes < 0 && estado === "pendiente";
              return (
                <div className="gc-trow" key={s.id} style={{ gridTemplateColumns: COLUMNAS }}>
                  <div className="gc-cell-main">
                    <span className="gc-fico otro" style={{ background: "linear-gradient(135deg,#7b5cfa,#4a67ff)" }}><Inbox size={15} /></span>
                    <div style={{ minWidth: 0 }}>
                      <b>{s.name}</b>
                      <small>{s.description || `Solicitado por ${s.created_by_name || "—"}`}</small>
                    </div>
                  </div>
                  <span className="gc-cell">{s.assigned_name || "Todos los participantes"}</span>
                  <span className="gc-cell">
                    {fmtFecha(s.due_date)}
                    {vencida && <span className="gc-badge danger" style={{ marginLeft: 6 }}>Vencida</span>}
                  </span>
                  <span className="gc-cell"><Estado valor={vencida ? "vencida" : estado} /></span>
                  <div className="gc-rowact">
                    {entregas.map((e) => (
                      <button key={e.id} className="gc-icbtn" title={`Ver entrega de ${e.user_name}`}
                        onClick={() => setVisor({
                          url: urlArchivo("entrega", e.id), file_name: e.file_name, titulo: s.name,
                          mime_type: e.mime_type, size_bytes: e.size_bytes, autor: e.user_name,
                          fecha: fmtFechaHora(e.created_at), contexto: "Entrega de documento solicitado",
                          observaciones: e.admin_observation || e.user_comment,
                        })}><Eye size={14} /></button>
                    )).slice(0, 2)}
                    {puedeResponder && estado !== "aprobado" && (
                      <button className="gc-icbtn" title="Entregar documento" onClick={() => { setDrawerEntrega(s); setArchivo(null); setComentario(""); }}>
                        <Upload size={14} />
                      </button>
                    )}
                    {puedeCrear && <button className="gc-icbtn danger" title="Eliminar solicitud" onClick={() => setConfirmar(s)}><Trash2 size={14} /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            <Vacio icono={Inbox} titulo={esTrabajador ? "No tienes documentos pendientes" : "No hay solicitudes registradas"}
              texto={esTrabajador ? "Cuando el supervisor te solicite un documento, aparecerá aquí."
                : "Solicita formalmente los documentos que deben entregar los contratistas."}
              accion={puedeCrear && <button className="gc-btn primary" onClick={abrirNueva}><Plus size={15} /> Nueva solicitud</button>} />
          </div>
        )}
      </section>

      {/* Entregas por revisar */}
      {!esTrabajador && datos.entregas.some((e) => e.status === "enviado") && (
        <section className="gc-card" style={{ marginTop: 16 }}>
          <header className="gc-card-title"><h3>Entregas por revisar</h3></header>
          <div style={{ display: "grid", gap: 9 }}>
            {datos.entregas.filter((e) => e.status === "enviado").map((e) => (
              <div className="gc-item" key={e.id}>
                <IconoArchivo nombre={e.file_name} />
                <span className="txt">
                  <b>{e.file_name}</b>
                  <small>{e.user_name} · {fmtFechaHora(e.created_at)} · {fmtTam(e.size_bytes)}</small>
                  {e.user_comment && <small style={{ color: "var(--gc-soft)", marginTop: 3 }}>“{e.user_comment}”</small>}
                </span>
                <div className="gc-rowact">
                  <button className="gc-icbtn" title="Ver" onClick={() => setVisor({
                    url: urlArchivo("entrega", e.id), file_name: e.file_name, mime_type: e.mime_type,
                    size_bytes: e.size_bytes, autor: e.user_name, fecha: fmtFechaHora(e.created_at),
                    contexto: "Entrega por revisar", observaciones: e.user_comment,
                  })}><Eye size={14} /></button>
                  <button className="gc-btn ok" style={{ padding: "7px 12px" }} onClick={() => revisar(e, "aprobar", "")}><Check size={14} /> Aprobar</button>
                  <button className="gc-btn ghost" style={{ padding: "7px 12px" }} onClick={() => setRevision(e)}><X size={14} /> Solicitar ajuste</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Nueva solicitud */}
      <Drawer abierto={!!drawerNueva} titulo="Nueva solicitud de documento"
        subtitulo="El contratista la verá en su espacio y podrá entregar el archivo."
        onClose={() => setDrawerNueva(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawerNueva(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !drawerNueva?.name?.trim()} onClick={crear}>
            {guardando ? "Creando…" : "Crear solicitud"}
          </button>
        </>}>
        {drawerNueva && (
          <div className="gc-form c2">
            <div className="gc-field gc-full">
              <label>Documento solicitado *</label>
              <input value={drawerNueva.name || ""} onChange={(e) => setDrawerNueva({ ...drawerNueva, name: e.target.value })}
                placeholder="Certificación de seguridad social — mayo" autoFocus />
            </div>
            <div className="gc-field gc-full">
              <label>Descripción</label>
              <textarea value={drawerNueva.description || ""} onChange={(e) => setDrawerNueva({ ...drawerNueva, description: e.target.value })}
                placeholder="Detalla qué debe contener el documento…" />
            </div>
            <div className="gc-field">
              <label>Dirigido a</label>
              <select value={drawerNueva.assigned_user_id || ""} onChange={(e) => setDrawerNueva({ ...drawerNueva, assigned_user_id: e.target.value })}>
                <option value="">Todos los participantes</option>
                {participantes.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
              </select>
            </div>
            <div className="gc-field"><label>Fecha límite</label><input type="date" value={drawerNueva.due_date || ""} onChange={(e) => setDrawerNueva({ ...drawerNueva, due_date: e.target.value })} /></div>
          </div>
        )}
      </Drawer>

      {/* Entregar documento */}
      <Drawer abierto={!!drawerEntrega} titulo="Entregar documento" subtitulo={drawerEntrega?.name}
        onClose={() => setDrawerEntrega(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawerEntrega(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !archivo} onClick={entregar}>{guardando ? "Enviando…" : "Entregar"}</button>
        </>}>
        <div className="gc-form">
          {drawerEntrega?.description && (
            <div style={{ fontSize: 12.5, color: "var(--gc-soft)", lineHeight: 1.55, background: "rgba(123,92,250,.07)", padding: 13, borderRadius: 12 }}>
              {drawerEntrega.description}
            </div>
          )}
          <div className="gc-field">
            <label>Archivo *</label>
            <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            {archivo && <span className="hint">{archivo.name} · {fmtTam(archivo.size)}</span>}
          </div>
          <div className="gc-field">
            <label>Comentario</label>
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Aclaraciones para quien revisa…" />
          </div>
        </div>
      </Drawer>

      <Confirmar abierto={!!revision} titulo="Solicitar corrección" pedirMotivo
        texto={`Se devolverá la entrega de ${revision?.user_name} para que la corrija.`}
        etiqueta="Solicitar corrección" tono="warn"
        onClose={() => setRevision(null)} onConfirmar={(motivo) => revisar(revision, "solicitar_ajuste", motivo)} />

      <Confirmar abierto={!!confirmar} titulo="Eliminar solicitud"
        texto={`Se eliminará «${confirmar?.name}» y las entregas asociadas. Esta acción es permanente.`}
        etiqueta="Eliminar" onClose={() => setConfirmar(null)} onConfirmar={() => eliminarSolicitud(confirmar)} />
    </>
  );
}
