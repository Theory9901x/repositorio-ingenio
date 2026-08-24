"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check, Download, Eye, ListChecks, Plus, RefreshCw, ShieldCheck, Trash2, Upload, Users, X,
} from "lucide-react";
import { api, enviarForm, enviarJson, urlArchivo } from "./api";
import { invalidar, useDatos } from "./cache";
import { Anillo, Cargando, Confirmar, Drawer, Estado, IconoArchivo, Vacio, fmtFecha, fmtFechaHora, fmtTam, iniciales } from "./ui";

const COLUMNAS = "minmax(0,1fr) 130px 150px 120px 120px";

// Contrato → contratista → checklist → evidencia → validación.
export default function TabEvidencias({ contratoId, detalle, avisar, setVisor, ruta, ir }) {
  const esTrabajador = detalle.rol === "TRABAJADOR";
  const [seleccion, setSeleccion] = useState(esTrabajador ? detalle.yo.id : ruta?.[0] ? Number(ruta[0]) : null);
  const [requisitos, setRequisitos] = useState([]);
  const [drawerReq, setDrawerReq] = useState(null);
  const [drawerCarga, setDrawerCarga] = useState(null);
  const [detalleEv, setDetalleEv] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [validacion, setValidacion] = useState(null);

  // Contratistas y checklist en una sola petición.
  const url = `/api/gc/contracts/${contratoId}/evidences?todo=1${seleccion ? `&userId=${seleccion}` : ""}`;
  const { datos, refrescar } = useDatos(url, { onError: (e) => avisar(e.message, "error") });
  const participantes = datos?.participantes ?? (esTrabajador ? [] : null);

  useEffect(() => {
    if (!seleccion && datos?.userId) setSeleccion(datos.userId);
  }, [datos, seleccion]);

  const cargar = useCallback(() => {
    invalidar(`/api/gc/contracts/${contratoId}/evidences`);
    return refrescar();
  }, [contratoId, refrescar]);

  async function abrirRequisitos() {
    try { setRequisitos(await api(`/api/gc/contracts/${contratoId}/evidence-requirements`)); }
    catch (e) { avisar(e.message, "error"); }
    setDrawerReq({ required: true });
  }

  async function crearRequisito() {
    setGuardando(true);
    try {
      await enviarJson(`/api/gc/contracts/${contratoId}/evidence-requirements`, "POST", drawerReq);
      avisar("Requisito creado");
      setRequisitos(await api(`/api/gc/contracts/${contratoId}/evidence-requirements`));
      setDrawerReq({ required: true });
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function usarPlantilla() {
    setGuardando(true);
    try {
      const r = await enviarJson(`/api/gc/contracts/${contratoId}/evidence-requirements`, "POST", { accion: "plantilla" });
      avisar(`${r.creados} requisito(s) creados desde la plantilla`);
      setRequisitos(await api(`/api/gc/contracts/${contratoId}/evidence-requirements`));
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function eliminarRequisito(id) {
    try {
      await api(`/api/gc/contracts/${contratoId}/evidence-requirements?reqId=${id}`, { method: "DELETE" });
      avisar("Requisito eliminado");
      setRequisitos(await api(`/api/gc/contracts/${contratoId}/evidence-requirements`));
      cargar();
    } catch (e) { avisar(e.message, "error"); }
  }

  async function cargarEvidencia() {
    if (!archivo) return avisar("Selecciona el archivo", "error");
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.set("requirementId", drawerCarga.id);
      fd.set("userId", seleccion);
      if (drawerCarga.frequency === "mensual") fd.set("period", new Date().toISOString().slice(0, 7));
      fd.set("file", archivo);
      await enviarForm(`/api/gc/contracts/${contratoId}/evidences`, "POST", fd);
      avisar("Evidencia cargada. Queda pendiente de validación.");
      setDrawerCarga(null); setArchivo(null); cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function validar(evidencia, accion, observacion) {
    try {
      await enviarJson(`/api/gc/evidences/${evidencia.id}`, "PUT", { accion, observations: observacion });
      avisar(accion === "validar" ? "Evidencia validada" : "Se solicitó la corrección");
      setValidacion(null); setDetalleEv(null); cargar();
    } catch (e) { avisar(e.message, "error"); setValidacion(null); }
  }

  const puedeConfigurar = detalle.permisos.includes("EVIDENCE_REQUIREMENT_MANAGE");
  const puedeValidar = detalle.permisos.includes("EVIDENCE_VALIDATE");
  const puedeCargar = detalle.permisos.includes("EVIDENCE_UPLOAD_OWN") || detalle.rol === "ADMIN";

  if (!esTrabajador && !participantes) return <section className="gc-card"><Cargando filas={4} /></section>;

  // Sin contratistas no hay nada que verificar.
  if (!esTrabajador && participantes.length === 0) {
    return (
      <section className="gc-card">
        <Vacio icono={Users} titulo="El contrato no tiene contratistas"
          texto="Asocia participantes en la pestaña «Contratistas» para llevar su checklist de evidencias." />
      </section>
    );
  }

  const persona = esTrabajador ? { full_name: detalle.yo.full_name, cargo: detalle.yo.cargo }
    : participantes.find((p) => p.user_id === seleccion);

  return (
    <>
      <div className={esTrabajador ? "" : "gc-split"}>
        {/* Columna izquierda: contratistas */}
        {!esTrabajador && (
          <section className="gc-card">
            <header className="gc-card-title"><h3>Contratistas</h3></header>
            <div className="gc-list">
              {participantes.map((p) => (
                <button className={`gc-item ${seleccion === p.user_id ? "on" : ""}`} key={p.user_id}
                  onClick={() => { setSeleccion(p.user_id); ir?.(p.user_id); }}>
                  <span className="gc-avatar" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 12 }}>
                    {p.has_photo ? <img src={`/api/profile/photo/${p.user_id}`} alt="" /> : iniciales(p.full_name)}
                  </span>
                  <span className="txt">
                    <b>{p.full_name}</b>
                    <small>{p.specialty || p.cargo || "—"}</small>
                  </span>
                </button>
              ))}
            </div>
            {puedeConfigurar && (
              <button className="gc-btn ghost" style={{ width: "100%", marginTop: 12, justifyContent: "center" }} onClick={abrirRequisitos}>
                <ListChecks size={15} /> Configurar requisitos
              </button>
            )}
          </section>
        )}

        {/* Zona principal: checklist */}
        <div style={{ display: "grid", gap: 16, alignContent: "start", minWidth: 0 }}>
          {!datos ? <section className="gc-card"><Cargando filas={5} /></section>
            : !datos.checklist.length ? (
              <section className="gc-card">
                <Vacio icono={ShieldCheck} titulo="Este contrato no tiene requisitos de evidencia"
                  texto="Define qué documentos debe entregar cada contratista para poder hacerles seguimiento."
                  accion={puedeConfigurar && (
                    <div className="gc-actions" style={{ justifyContent: "center" }}>
                      <button className="gc-btn primary" onClick={usarPlantilla} disabled={guardando}>
                        <ListChecks size={15} /> Usar plantilla estándar
                      </button>
                      <button className="gc-btn ghost" onClick={abrirRequisitos}><Plus size={15} /> Crear requisito</button>
                    </div>
                  )} />
              </section>
            ) : (
              <>
                <section className="gc-card">
                  <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                    <Anillo valor={datos.resumen.validadas} total={datos.resumen.total} size={82} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <h3 style={{ fontFamily: "'Bricolage Grotesque'", fontSize: 17, margin: "0 0 3px" }}>{persona?.full_name}</h3>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--gc-muted)", fontWeight: 700 }}>
                        {persona?.specialty || persona?.cargo || "Contratista"} · {datos.resumen.validadas} de {datos.resumen.total} evidencias validadas
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                      <Chip valor={datos.resumen.requeridas} etiqueta="Requeridas" />
                      <Chip valor={datos.resumen.cargadas} etiqueta="Cargadas" tono="info" />
                      <Chip valor={datos.resumen.validadas} etiqueta="Validadas" tono="ok" />
                      <Chip valor={datos.resumen.pendientes} etiqueta="Pendientes" tono="warn" />
                      <Chip valor={datos.resumen.rechazadas} etiqueta="Con ajustes" tono="danger" />
                    </div>
                  </div>
                </section>

                <section className="gc-card flush">
                  <header className="gc-card-title" style={{ padding: "16px 18px 0", margin: 0 }}>
                    <h3>Checklist de evidencias</h3>
                    {puedeConfigurar && <button className="gc-btn ghost" onClick={abrirRequisitos}><ListChecks size={15} /> Requisitos</button>}
                  </header>
                  <div className="gc-table" style={{ marginTop: 14 }}>
                    <div className="gc-thead" style={{ gridTemplateColumns: COLUMNAS }}>
                      <span>Evidencia</span><span>Categoría</span><span>Archivo</span><span>Estado</span><span style={{ textAlign: "right" }}>Acciones</span>
                    </div>
                    {datos.checklist.map((c) => (
                      <div className={`gc-trow ${c.evidencia ? "click" : ""}`} key={c.id} style={{ gridTemplateColumns: COLUMNAS }}
                        onClick={() => c.evidencia && setDetalleEv(c)}>
                        <div className="gc-cell-main">
                          {c.evidencia ? <IconoArchivo nombre={c.evidencia.file_name} />
                            : <span className="gc-fico otro"><ShieldCheck size={15} /></span>}
                          <div style={{ minWidth: 0 }}>
                            <b>{c.name}</b>
                            <small>{c.required ? "Obligatoria" : "Opcional"}{c.due_date ? ` · vence ${fmtFecha(c.due_date)}` : ""}</small>
                          </div>
                        </div>
                        <span className="gc-cell">{c.category || "—"}</span>
                        <span className="gc-cell">{c.evidencia?.file_name || <em style={{ color: "var(--gc-muted)" }}>Sin cargar</em>}</span>
                        <span className="gc-cell"><Estado valor={c.status} /></span>
                        <div className="gc-rowact" onClick={(e) => e.stopPropagation()}>
                          {c.evidencia && (
                            <button className="gc-icbtn" title="Ver evidencia" onClick={() => setVisor(visorDe(c, persona))}><Eye size={14} /></button>
                          )}
                          {puedeCargar && (esTrabajador ? c.status !== "validada" : true) && (
                            <button className="gc-icbtn" title={c.evidencia ? "Reemplazar" : "Cargar"}
                              onClick={() => { setDrawerCarga(c); setArchivo(null); }}>
                              {c.evidencia ? <RefreshCw size={14} /> : <Upload size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
        </div>
      </div>

      {/* Detalle y validación de una evidencia */}
      <Drawer abierto={!!detalleEv} titulo={detalleEv?.name} subtitulo="Detalle de la evidencia y su validación"
        onClose={() => setDetalleEv(null)}
        pie={puedeValidar && detalleEv?.evidencia && (
          <>
            <button className="gc-btn ghost" onClick={() => setValidacion({ ev: detalleEv.evidencia, accion: "rechazar" })}><X size={14} /> Rechazar</button>
            <button className="gc-btn warn" onClick={() => setValidacion({ ev: detalleEv.evidencia, accion: "solicitar_ajuste" })}>Solicitar ajuste</button>
            <button className="gc-btn ok" onClick={() => validar(detalleEv.evidencia, "validar", "")}><Check size={14} /> Validar</button>
          </>
        )}>
        {detalleEv?.evidencia && (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="gc-item" style={{ cursor: "default" }}>
              <IconoArchivo nombre={detalleEv.evidencia.file_name} />
              <span className="txt">
                <b>{detalleEv.evidencia.file_name}</b>
                <small>{fmtTam(detalleEv.evidencia.size_bytes)} · {fmtFechaHora(detalleEv.evidencia.uploaded_at)}</small>
              </span>
              <button className="gc-icbtn" onClick={() => setVisor(visorDe(detalleEv, persona))}><Eye size={14} /></button>
            </div>
            {[["Categoría", detalleEv.category || "—"], ["Estado", null],
              ["Periodo", detalleEv.evidencia.period || "Única"],
              ["Validada por", detalleEv.evidencia.validated_by_name || "Sin validar"],
              ["Fecha de validación", detalleEv.evidencia.validated_at ? fmtFechaHora(detalleEv.evidencia.validated_at) : "—"]]
              .map(([k, v]) => (
                <div className="gc-viewer-row" key={k}>
                  <span>{k}</span>
                  <b>{k === "Estado" ? <Estado valor={detalleEv.status} /> : v}</b>
                </div>
              ))}
            {detalleEv.evidencia.observations && (
              <div style={{ background: "rgba(226,68,95,.08)", borderRadius: 12, padding: 13, fontSize: 12.5, lineHeight: 1.55 }}>
                <b style={{ display: "block", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gc-danger)", marginBottom: 5 }}>Observación</b>
                {detalleEv.evidencia.observations}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Carga de evidencia */}
      <Drawer abierto={!!drawerCarga} titulo={drawerCarga?.evidencia ? "Reemplazar evidencia" : "Cargar evidencia"}
        subtitulo={drawerCarga?.name} onClose={() => setDrawerCarga(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawerCarga(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !archivo} onClick={cargarEvidencia}>{guardando ? "Cargando…" : "Cargar"}</button>
        </>}>
        <div className="gc-form">
          {drawerCarga?.description && (
            <div style={{ fontSize: 12.5, color: "var(--gc-soft)", lineHeight: 1.55, background: "rgba(123,92,250,.07)", padding: 13, borderRadius: 12 }}>
              {drawerCarga.description}
            </div>
          )}
          <div className="gc-field">
            <label>Archivo *</label>
            <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            {archivo && <span className="hint">{archivo.name} · {fmtTam(archivo.size)}</span>}
            {drawerCarga?.evidencia && <span className="hint">Se reemplazará el archivo actual y volverá a quedar pendiente de validación.</span>}
          </div>
        </div>
      </Drawer>

      {/* Requisitos del contrato */}
      <Drawer abierto={!!drawerReq} titulo="Requisitos de evidencia"
        subtitulo="Definen el checklist que debe cumplir cada contratista." onClose={() => setDrawerReq(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={usarPlantilla} disabled={guardando} style={{ marginRight: "auto" }}>
            <ListChecks size={14} /> Plantilla estándar
          </button>
          <button className="gc-btn primary" disabled={guardando || !drawerReq?.name?.trim()} onClick={crearRequisito}>
            <Plus size={14} /> Agregar requisito
          </button>
        </>}>
        {drawerReq && (
          <>
            <div className="gc-form c2">
              <div className="gc-field gc-full">
                <label>Nombre del requisito</label>
                <input value={drawerReq.name || ""} onChange={(e) => setDrawerReq({ ...drawerReq, name: e.target.value })} placeholder="Certificación ARL" />
              </div>
              <div className="gc-field">
                <label>Categoría</label>
                <input value={drawerReq.category || ""} onChange={(e) => setDrawerReq({ ...drawerReq, category: e.target.value })} placeholder="Seguridad y salud" />
              </div>
              <div className="gc-field">
                <label>Frecuencia</label>
                <select value={drawerReq.frequency || "unica"} onChange={(e) => setDrawerReq({ ...drawerReq, frequency: e.target.value })}>
                  <option value="unica">Única</option><option value="mensual">Mensual</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--gc-muted)" }}>
                Requisitos definidos ({requisitos.length})
              </span>
              {requisitos.map((r) => (
                <div className="gc-item" key={r.id} style={{ cursor: "default" }}>
                  <span className="ico" style={{ background: "rgba(31,196,220,.13)", color: "var(--gc-cyan)" }}><ShieldCheck size={15} /></span>
                  <span className="txt">
                    <b>{r.name}</b>
                    <small>{r.category || "Sin categoría"} · {r.cargadas} cargada(s), {r.validadas} validada(s)</small>
                  </span>
                  <button className="gc-icbtn danger" title="Eliminar" onClick={() => eliminarRequisito(r.id)}><Trash2 size={14} /></button>
                </div>
              ))}
              {!requisitos.length && <p style={{ fontSize: 12.5, color: "var(--gc-muted)", fontWeight: 700, margin: 0 }}>Todavía no hay requisitos definidos.</p>}
            </div>
          </>
        )}
      </Drawer>

      <Confirmar abierto={!!validacion}
        titulo={validacion?.accion === "rechazar" ? "Rechazar evidencia" : "Solicitar ajuste"}
        texto="El contratista verá tu observación y podrá volver a cargar el documento."
        etiqueta={validacion?.accion === "rechazar" ? "Rechazar" : "Solicitar ajuste"}
        tono={validacion?.accion === "rechazar" ? "danger" : "warn"} pedirMotivo
        onClose={() => setValidacion(null)}
        onConfirmar={(motivo) => validar(validacion.ev, validacion.accion, motivo)} />
    </>
  );
}

function visorDe(c, persona) {
  return {
    url: urlArchivo("evidencia", c.evidencia.id), file_name: c.evidencia.file_name, titulo: c.name,
    mime_type: c.evidencia.mime_type, size_bytes: c.evidencia.size_bytes,
    autor: persona?.full_name, fecha: fmtFechaHora(c.evidencia.uploaded_at),
    contexto: `Evidencia · ${c.category || "Sin categoría"}`, observaciones: c.evidencia.observations,
  };
}

function Chip({ valor, etiqueta, tono = "muted" }) {
  return (
    <div style={{ textAlign: "center", minWidth: 62 }}>
      <div className={`gc-badge ${tono}`} style={{ fontSize: 15, padding: "6px 12px", fontFamily: "'Bricolage Grotesque'" }}>{valor}</div>
      <span style={{ display: "block", fontSize: 10, fontWeight: 800, color: "var(--gc-muted)", marginTop: 4 }}>{etiqueta}</span>
    </div>
  );
}
