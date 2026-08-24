"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check, ClipboardList, Download, Eye, FileText, Paperclip, Plus, Send, Trash2, Upload, Users, X,
} from "lucide-react";
import { api, enviarForm, enviarJson, urlArchivo } from "./api";
import {
  Cargando, Confirmar, Drawer, Estado, IconoArchivo, MESES, Vacio,
  fmtFecha, fmtFechaHora, fmtTam, iniciales,
} from "./ui";

const COLUMNAS = "minmax(0,1.6fr) 100px 110px 108px 76px";
const hoy = new Date();

// Contrato → contratista → periodo → actividad → anexos.
export default function TabActividades({ contratoId, detalle, avisar, setVisor, seleccion, ir }) {
  const esTrabajador = detalle.rol === "TRABAJADOR";
  const [participantes, setParticipantes] = useState(null);
  const [userId, setUserId] = useState(esTrabajador ? detalle.yo.id : seleccion.userId);
  const [year, setYear] = useState(seleccion.year || hoy.getFullYear());
  const [month, setMonth] = useState(seleccion.month || hoy.getMonth() + 1);
  const [periodos, setPeriodos] = useState([]);
  const [datos, setDatos] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [detalleAct, setDetalleAct] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [revision, setRevision] = useState(null);
  const [anexos, setAnexos] = useState([]);

  useEffect(() => {
    if (esTrabajador) { setParticipantes([]); return; }
    api(`/api/gc/contracts/${contratoId}/participants`)
      .then((p) => {
        setParticipantes(p);
        setUserId((u) => u ?? p.find((x) => x.role_in_contract !== "supervisor")?.user_id ?? p[0]?.user_id ?? null);
      })
      .catch(() => setParticipantes([]));
  }, [contratoId, esTrabajador]);

  // Periodos disponibles del contratista seleccionado.
  useEffect(() => {
    if (!userId) return;
    api(`/api/gc/contracts/${contratoId}/activities?userId=${userId}`)
      .then((d) => setPeriodos(d.periodos || []))
      .catch(() => setPeriodos([]));
  }, [contratoId, userId]);

  const cargar = useCallback(async () => {
    if (!userId) { setDatos(null); return; }
    try {
      setDatos(await api(`/api/gc/contracts/${contratoId}/activities?userId=${userId}&year=${year}&month=${month}`));
    } catch (e) { avisar(e.message, "error"); setDatos(null); }
  }, [contratoId, userId, year, month, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => { if (userId) ir?.(userId, year, month); }, [userId, year, month]); // eslint-disable-line

  async function guardarActividad() {
    setGuardando(true);
    try {
      if (drawer.id) await enviarJson(`/api/gc/activities/${drawer.id}`, "PUT", drawer);
      else await enviarJson(`/api/gc/contracts/${contratoId}/activities`, "POST", { ...drawer, user_id: userId });
      avisar(drawer.id ? "Actividad actualizada" : "Actividad registrada");
      setDrawer(null); cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function abrirDetalle(act) {
    try {
      const d = await api(`/api/gc/activities/${act.id}`);
      if (!d?.actividad) throw new Error("No se pudo cargar el detalle de la actividad");
      setDetalleAct({ anexos: [], comentarios: [], ...d });
      setAnexos([]);
    } catch (e) { avisar(e.message, "error"); }
  }

  async function subirAnexos() {
    if (!anexos.length) return avisar("Selecciona al menos un archivo", "error");
    setGuardando(true);
    try {
      const fd = new FormData();
      for (const f of anexos) fd.append("files", f);
      await enviarForm(`/api/gc/activities/${detalleAct.actividad.id}`, "POST", fd);
      avisar("Anexos cargados");
      setAnexos([]);
      setDetalleAct(await api(`/api/gc/activities/${detalleAct.actividad.id}`));
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function eliminarAnexo(id) {
    try {
      await api(`/api/gc/attachments/${id}`, { method: "DELETE" });
      avisar("Anexo eliminado");
      setDetalleAct(await api(`/api/gc/activities/${detalleAct.actividad.id}`));
      cargar();
    } catch (e) { avisar(e.message, "error"); }
  }

  async function revisarActividad(act, status, comentario) {
    try {
      await enviarJson(`/api/gc/activities/${act.id}`, "PUT", { accion: "revisar", status, admin_comment: comentario });
      avisar(status === "approved" ? "Actividad aprobada" : "Se solicitó el ajuste");
      setRevision(null); setDetalleAct(null); cargar();
    } catch (e) { avisar(e.message, "error"); setRevision(null); }
  }

  async function eliminarActividad(act) {
    try {
      await api(`/api/gc/activities/${act.id}`, { method: "DELETE" });
      avisar("Actividad eliminada");
      setConfirmar(null); setDetalleAct(null); cargar();
    } catch (e) { avisar(e.message, "error"); setConfirmar(null); }
  }

  /* ---------- Informe mensual ---------- */
  async function generarInforme() {
    setGuardando(true);
    try {
      await enviarJson(`/api/gc/contracts/${contratoId}/reports`, "POST", { year, month, user_id: userId });
      avisar("Informe generado a partir de las actividades del periodo");
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }
  async function cargarInforme(file) {
    if (!file) return;
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.set("year", year); fd.set("month", month); fd.set("userId", userId); fd.set("file", file);
      await enviarForm(`/api/gc/contracts/${contratoId}/reports`, "POST", fd);
      avisar("Informe cargado");
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }
  async function accionInforme(accion, observacion) {
    try {
      await enviarJson(`/api/gc/reports/${datos.informe.id}`, "PUT", { accion, observations: observacion });
      avisar({
        presentar: "Informe presentado al supervisor", aprobar: "Informe aprobado",
        rechazar: "Informe rechazado", solicitar_ajustes: "Se solicitaron ajustes al informe",
      }[accion]);
      setRevision(null); cargar();
    } catch (e) { avisar(e.message, "error"); setRevision(null); }
  }

  if (!esTrabajador && !participantes) return <section className="gc-card"><Cargando filas={4} /></section>;
  if (!esTrabajador && participantes.length === 0) {
    return (
      <section className="gc-card">
        <Vacio icono={Users} titulo="El contrato no tiene contratistas"
          texto="Asocia participantes en la pestaña «Contratistas» para registrar sus actividades." />
      </section>
    );
  }

  const persona = esTrabajador ? { full_name: detalle.yo.full_name, cargo: detalle.yo.cargo }
    : participantes.find((p) => p.user_id === userId);
  const puedeRegistrar = esTrabajador || detalle.rol === "ADMIN";
  const puedeRevisar = detalle.permisos.includes("ACTIVITY_REVIEW");
  const informe = datos?.informe;
  const propioInforme = Number(userId) === Number(detalle.yo.id);

  // Meses del año en curso, marcando los que ya tienen periodo.
  const mesesAno = Array.from({ length: 12 }, (_, i) => {
    const p = periodos.find((x) => x.year === year && x.month === i + 1);
    return { month: i + 1, ...p };
  });

  return (
    <>
      <div className="gc-split wide">
        {/* Columna 1: contratista y periodo */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {!esTrabajador && (
            <section className="gc-card">
              <header className="gc-card-title"><h3>Contratista</h3></header>
              <div className="gc-list" style={{ maxHeight: 210 }}>
                {participantes.map((p) => (
                  <button className={`gc-item ${userId === p.user_id ? "on" : ""}`} key={p.user_id} onClick={() => setUserId(p.user_id)}>
                    <span className="gc-avatar" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 11.5 }}>
                      {p.has_photo ? <img src={`/api/profile/photo/${p.user_id}`} alt="" /> : iniciales(p.full_name)}
                    </span>
                    <span className="txt"><b>{p.full_name}</b><small>{p.actividades} actividad(es)</small></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="gc-card">
            <header className="gc-card-title">
              <h3>Periodo</h3>
              <select className="gc-btn ghost" style={{ padding: "6px 9px", fontSize: 12 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[hoy.getFullYear() + 1, hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </header>
            <div className="gc-list" style={{ maxHeight: 380 }}>
              {mesesAno.map((m) => (
                <button className={`gc-item ${month === m.month ? "on" : ""}`} key={m.month} onClick={() => setMonth(m.month)}
                  style={{ padding: "10px 12px" }}>
                  <span className="txt">
                    <b>{MESES[m.month - 1]} {year}</b>
                    <small>{m.id ? `${m.actividades || 0} actividad(es)` : "Sin registros"}</small>
                  </span>
                  {m.informe_estado && <Estado valor={m.informe_estado} />}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Columna 2: actividades del periodo */}
        <div style={{ display: "grid", gap: 16, alignContent: "start", minWidth: 0 }}>
          <section className="gc-card flush">
            <header className="gc-card-title" style={{ padding: "16px 18px 0", margin: 0 }}>
              <div>
                <h3>Actividades — {MESES[month - 1]} {year}</h3>
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--gc-muted)", fontWeight: 700 }}>
                  {persona?.full_name} · {datos?.actividades?.length || 0} registrada(s)
                </p>
              </div>
              {puedeRegistrar && (
                <button className="gc-btn primary" onClick={() => setDrawer({ activity_date: `${year}-${String(month).padStart(2, "0")}-${String(Math.min(hoy.getDate(), 28)).padStart(2, "0")}`, status: "draft" })}>
                  <Plus size={15} /> Nueva actividad
                </button>
              )}
            </header>

            {!datos ? <div style={{ padding: 18 }}><Cargando filas={4} /></div>
              : datos.actividades.length ? (
                <div className="gc-table" style={{ marginTop: 14 }}>
                  <div className="gc-thead" style={{ gridTemplateColumns: COLUMNAS }}>
                    <span>Actividad</span><span>Fecha</span><span>Categoría</span><span>Estado</span><span style={{ textAlign: "right" }}>Anexos</span>
                  </div>
                  {datos.actividades.map((a) => (
                    <div className="gc-trow click" key={a.id} style={{ gridTemplateColumns: COLUMNAS }} onClick={() => abrirDetalle(a)}>
                      <div className="gc-cell-main">
                        <span className="gc-fico otro" style={{ background: "linear-gradient(135deg,#4a67ff,#7b5cfa)" }}><ClipboardList size={15} /></span>
                        <div style={{ minWidth: 0 }}>
                          <b>{a.title}</b>
                          <small>{a.description ? a.description.slice(0, 70) : "Sin descripción"}</small>
                        </div>
                      </div>
                      <span className="gc-cell">{fmtFecha(a.activity_date)}</span>
                      <span className="gc-cell">{a.category || "—"}</span>
                      <span className="gc-cell"><Estado valor={a.status} /></span>
                      <div className="gc-rowact">
                        <span className="gc-badge muted"><Paperclip size={11} /> {a.anexos}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 18 }}>
                  <Vacio icono={ClipboardList} titulo={`No hay actividades registradas en ${MESES[month - 1].toLowerCase()}`}
                    texto="Registra la primera actividad de este periodo."
                    accion={puedeRegistrar && (
                      <button className="gc-btn primary" onClick={() => setDrawer({ activity_date: `${year}-${String(month).padStart(2, "0")}-01`, status: "draft" })}>
                        <Plus size={15} /> Crear actividad
                      </button>
                    )} />
                </div>
              )}
          </section>
        </div>

        {/* Columna 3: informe mensual */}
        <section className="gc-card" style={{ alignSelf: "start" }}>
          <header className="gc-card-title"><h3>Informe mensual</h3></header>
          {!datos ? <Cargando filas={2} /> : (
            <div style={{ display: "grid", gap: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span className="gc-fico otro" style={{ width: 40, height: 40, borderRadius: 13, background: "linear-gradient(135deg,#4a67ff,#1fc4dc)" }}>
                  <FileText size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 13 }}>{MESES[month - 1]} {year}</b>
                  <span style={{ fontSize: 11, color: "var(--gc-muted)", fontWeight: 700 }}>
                    {informe ? `Versión ${informe.version}` : "No generado"}
                  </span>
                </div>
                <Estado valor={informe?.status || "borrador"} />
              </div>

              <div style={{ display: "grid", gap: 7, paddingTop: 11, borderTop: "1px dashed var(--gc-line)" }}>
                <Fila etiqueta="Actividades" valor={datos.resumen?.total ?? 0} />
                <Fila etiqueta="Anexos" valor={datos.resumen?.anexos ?? 0} />
                {informe?.submitted_at && <Fila etiqueta="Presentado" valor={fmtFechaHora(informe.submitted_at)} />}
                {informe?.reviewer_name && <Fila etiqueta="Revisado por" valor={informe.reviewer_name} />}
              </div>

              {informe?.observations && (
                <div style={{ background: "rgba(224,147,12,.1)", borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.5 }}>
                  <b style={{ display: "block", fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gc-warn)", marginBottom: 4 }}>
                    Observación del revisor
                  </b>
                  {informe.observations}
                </div>
              )}

              <div style={{ display: "grid", gap: 8 }}>
                {informe?.file_path && (
                  <button className="gc-btn ghost" style={{ justifyContent: "center" }} onClick={() => setVisor({
                    url: urlArchivo("informe", informe.id), file_name: informe.file_name,
                    titulo: `Informe ${MESES[month - 1]} ${year}`, mime_type: informe.mime_type,
                    size_bytes: informe.size_bytes, autor: persona?.full_name,
                    fecha: fmtFechaHora(informe.submitted_at), contexto: "Informe mensual de actividades",
                  })}><Eye size={14} /> Ver informe</button>
                )}

                {propioInforme && (!informe || ["borrador", "requiere_ajustes", "rechazado"].includes(informe.status)) && (
                  <>
                    <button className="gc-btn soft" style={{ justifyContent: "center" }} disabled={guardando || !datos.actividades.length} onClick={generarInforme}>
                      <FileText size={14} /> {informe ? "Regenerar desde actividades" : "Generar informe"}
                    </button>
                    <label className="gc-btn ghost" style={{ justifyContent: "center", cursor: "pointer" }}>
                      <Upload size={14} /> Cargar informe
                      <input type="file" hidden onChange={(e) => { cargarInforme(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                  </>
                )}

                {propioInforme && informe && ["borrador", "requiere_ajustes", "rechazado"].includes(informe.status) && (
                  <button className="gc-btn primary" style={{ justifyContent: "center" }} onClick={() => accionInforme("presentar")}>
                    <Send size={14} /> Presentar al supervisor
                  </button>
                )}

                {puedeRevisar && informe?.status === "en_revision" && !propioInforme && (
                  <>
                    <button className="gc-btn ok" style={{ justifyContent: "center" }} onClick={() => accionInforme("aprobar")}><Check size={14} /> Aprobar informe</button>
                    <button className="gc-btn warn" style={{ justifyContent: "center" }} onClick={() => setRevision({ tipo: "informe", accion: "solicitar_ajustes" })}>Solicitar ajustes</button>
                    <button className="gc-btn ghost" style={{ justifyContent: "center" }} onClick={() => setRevision({ tipo: "informe", accion: "rechazar" })}><X size={14} /> Rechazar</button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Crear / editar actividad */}
      <Drawer abierto={!!drawer} titulo={drawer?.id ? "Editar actividad" : "Nueva actividad"}
        subtitulo={`${persona?.full_name} · ${MESES[month - 1]} ${year}`} onClose={() => setDrawer(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawer(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !drawer?.title?.trim()} onClick={guardarActividad}>
            {guardando ? "Guardando…" : "Guardar actividad"}
          </button>
        </>}>
        {drawer && (
          <div className="gc-form c2">
            <div className="gc-field gc-full">
              <label>Nombre de la actividad *</label>
              <input value={drawer.title || ""} onChange={(e) => setDrawer({ ...drawer, title: e.target.value })} placeholder="Levantamiento topográfico" autoFocus />
            </div>
            <div className="gc-field"><label>Fecha de ejecución</label><input type="date" value={drawer.activity_date || ""} onChange={(e) => setDrawer({ ...drawer, activity_date: e.target.value })} /></div>
            <div className="gc-field"><label>Categoría</label><input value={drawer.category || ""} onChange={(e) => setDrawer({ ...drawer, category: e.target.value })} placeholder="Topografía, obra civil…" /></div>
            <div className="gc-field gc-full">
              <label>Descripción de lo realizado</label>
              <textarea value={drawer.description || ""} onChange={(e) => setDrawer({ ...drawer, description: e.target.value })} placeholder="Detalla la actividad ejecutada…" />
            </div>
            <div className="gc-field gc-full"><label>Resultado</label><textarea value={drawer.result || ""} onChange={(e) => setDrawer({ ...drawer, result: e.target.value })} placeholder="Producto o resultado obtenido…" /></div>
            <div className="gc-field gc-full"><label>Observaciones</label><textarea value={drawer.user_observation || ""} onChange={(e) => setDrawer({ ...drawer, user_observation: e.target.value })} /></div>
            <div className="gc-field">
              <label>Estado</label>
              <select value={drawer.status || "draft"} onChange={(e) => setDrawer({ ...drawer, status: e.target.value })}>
                <option value="draft">Borrador</option><option value="submitted">Presentada para revisión</option>
              </select>
              <span className="hint">Los anexos se agregan al abrir la actividad.</span>
            </div>
          </div>
        )}
      </Drawer>

      {/* Detalle de actividad y sus anexos */}
      <Drawer abierto={!!detalleAct?.actividad} titulo={detalleAct?.actividad?.title}
        subtitulo={detalleAct && `${fmtFecha(detalleAct.actividad.activity_date)} · ${detalleAct.actividad.user_name}`}
        onClose={() => setDetalleAct(null)}
        pie={detalleAct?.actividad && (
          <>
            {(detalleAct.actividad.user_id === detalle.yo.id || detalle.rol === "ADMIN") && detalleAct.actividad.status !== "approved" && (
              <button className="gc-btn danger" style={{ marginRight: "auto" }} onClick={() => setConfirmar(detalleAct.actividad)}>
                <Trash2 size={14} /> Eliminar
              </button>
            )}
            {puedeRevisar && detalleAct.actividad.user_id !== detalle.yo.id && detalleAct.actividad.status !== "approved" && (
              <>
                <button className="gc-btn warn" onClick={() => setRevision({ tipo: "actividad", act: detalleAct.actividad, status: "needs_changes" })}>Solicitar ajuste</button>
                <button className="gc-btn ok" onClick={() => revisarActividad(detalleAct.actividad, "approved", "")}><Check size={14} /> Aprobar</button>
              </>
            )}
            {(detalleAct.actividad.user_id === detalle.yo.id || detalle.rol === "ADMIN") && detalleAct.actividad.status !== "approved" && (
              <button className="gc-btn primary" onClick={() => { setDrawer({ ...detalleAct.actividad }); setDetalleAct(null); }}>Editar</button>
            )}
          </>
        )}>
        {detalleAct?.actividad && (
          <>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              <Estado valor={detalleAct.actividad.status} />
              {detalleAct.actividad.category && <span className="gc-badge muted">{detalleAct.actividad.category}</span>}
            </div>
            {detalleAct.actividad.description && <Bloque titulo="Descripción" texto={detalleAct.actividad.description} />}
            {detalleAct.actividad.result && <Bloque titulo="Resultado" texto={detalleAct.actividad.result} />}
            {detalleAct.actividad.user_observation && <Bloque titulo="Observaciones del contratista" texto={detalleAct.actividad.user_observation} />}
            {detalleAct.actividad.admin_comment && (
              <div style={{ background: "rgba(224,147,12,.1)", borderRadius: 12, padding: 13, fontSize: 12.5, lineHeight: 1.55 }}>
                <b style={{ display: "block", fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gc-warn)", marginBottom: 5 }}>
                  Comentario de revisión{detalleAct.actividad.reviewer_name ? ` · ${detalleAct.actividad.reviewer_name}` : ""}
                </b>
                {detalleAct.actividad.admin_comment}
              </div>
            )}

            <div>
              <div className="gc-card-title" style={{ marginBottom: 10 }}>
                <h3 style={{ fontSize: 13.5 }}>Anexos de la actividad ({detalleAct.anexos.length})</h3>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {detalleAct.anexos.map((a) => (
                  <div className="gc-item" key={a.id} style={{ cursor: "default", padding: 10 }}>
                    <IconoArchivo nombre={a.file_name} />
                    <span className="txt">
                      <b>{a.file_name}</b>
                      <small>{fmtTam(a.size_bytes)} · {fmtFechaHora(a.created_at)}</small>
                    </span>
                    <div className="gc-rowact">
                      <button className="gc-icbtn" title="Ver" onClick={() => setVisor({
                        url: urlArchivo("anexo", a.id), file_name: a.file_name, mime_type: a.mime_type,
                        size_bytes: a.size_bytes, autor: detalleAct.actividad.user_name,
                        fecha: fmtFechaHora(a.created_at), contexto: `Anexo de «${detalleAct.actividad.title}»`,
                      })}><Eye size={14} /></button>
                      <a className="gc-icbtn" title="Descargar" href={urlArchivo("anexo", a.id) + "&download=1"} download={a.file_name}><Download size={14} /></a>
                      {(detalleAct.actividad.user_id === detalle.yo.id || detalle.rol === "ADMIN") && detalleAct.actividad.status !== "approved" && (
                        <button className="gc-icbtn danger" title="Eliminar" onClick={() => eliminarAnexo(a.id)}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                ))}
                {!detalleAct.anexos.length && (
                  <p style={{ fontSize: 12.5, color: "var(--gc-muted)", fontWeight: 700, margin: 0 }}>
                    Esta actividad todavía no tiene soportes adjuntos.
                  </p>
                )}
              </div>

              {(detalleAct.actividad.user_id === detalle.yo.id || detalle.rol === "ADMIN") && detalleAct.actividad.status !== "approved" && (
                <div className="gc-field" style={{ marginTop: 13 }}>
                  <label>Agregar anexos</label>
                  <input type="file" multiple onChange={(e) => setAnexos([...e.target.files])} />
                  {anexos.length > 0 && (
                    <button className="gc-btn primary" style={{ marginTop: 9, justifyContent: "center" }} disabled={guardando} onClick={subirAnexos}>
                      <Upload size={14} /> Cargar {anexos.length} archivo(s)
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </Drawer>

      <Confirmar abierto={!!revision}
        titulo={revision?.tipo === "informe"
          ? (revision.accion === "rechazar" ? "Rechazar informe" : "Solicitar ajustes al informe")
          : "Solicitar ajuste de la actividad"}
        texto="El contratista verá tu observación y podrá corregir."
        etiqueta="Enviar" tono={revision?.accion === "rechazar" ? "danger" : "warn"} pedirMotivo
        onClose={() => setRevision(null)}
        onConfirmar={(motivo) => revision.tipo === "informe"
          ? accionInforme(revision.accion, motivo)
          : revisarActividad(revision.act, revision.status, motivo)} />

      <Confirmar abierto={!!confirmar} titulo="Eliminar actividad"
        texto={`Se eliminará «${confirmar?.title}» junto con sus anexos. Esta acción es permanente.`}
        etiqueta="Eliminar" onClose={() => setConfirmar(null)} onConfirmar={() => eliminarActividad(confirmar)} />
    </>
  );
}

function Fila({ etiqueta, valor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
      <span style={{ color: "var(--gc-muted)", fontWeight: 700 }}>{etiqueta}</span>
      <b style={{ fontWeight: 800 }}>{valor}</b>
    </div>
  );
}

function Bloque({ titulo, texto }) {
  return (
    <div>
      <b style={{ display: "block", fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gc-muted)", marginBottom: 5 }}>{titulo}</b>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--gc-soft)" }}>{texto}</p>
    </div>
  );
}
