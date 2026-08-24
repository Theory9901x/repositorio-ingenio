"use client";

import { useCallback, useState } from "react";
import {
  CalendarDays, CalendarRange, ClipboardCheck, Download, Eye, FileDown, FileText, FileType2,
  Image as ImageIcon, MapPin, Paperclip, Plus, Trash2, Upload, Users,
} from "lucide-react";
import { api, enviarForm, enviarJson, urlArchivo } from "./api";
import { invalidar, useDatos } from "./cache";
import { BotonExportar, Cargando, Confirmar, Drawer, IconoArchivo, Vacio, fmtFecha, fmtTam, iniciales } from "./ui";

// Mesas de trabajo por persona. El recorrido es el que sigue el contratista:
// primero deja su cronograma y después registra cada mesa con su acta, su
// lista de asistencia y el registro fotográfico.

const RANURAS = [
  { kind: "acta", etiqueta: "Acta de la mesa", Icono: FileText },
  { kind: "asistencia", etiqueta: "Lista de asistencia", Icono: Users },
];

export default function TabMesas({ contratoId, detalle, avisar, setVisor }) {
  const esTrabajador = detalle.rol === "TRABAJADOR";
  const [persona, setPersona] = useState(esTrabajador ? detalle.yo.id : null);
  const [drawerAlta, setDrawerAlta] = useState(null);
  const [drawerPlan, setDrawerPlan] = useState(null);
  const [archivoPlan, setArchivoPlan] = useState(null);
  const [subiendo, setSubiendo] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const urlPart = `/api/gc/contracts/${contratoId}/participants`;
  const { datos: participantes } = useDatos(esTrabajador ? null : urlPart, { onError: (e) => avisar(e.message, "error") });

  const quien = esTrabajador ? detalle.yo.id : persona;
  const urlMesas = `/api/gc/contracts/${contratoId}/meetings?tipo=mesa${quien ? `&userId=${quien}` : ""}`;
  const urlPlan = `/api/gc/contracts/${contratoId}/workplan${quien && !esTrabajador ? `?userId=${quien}` : ""}`;
  const { datos: mesas, refrescar: refMesas } = useDatos(quien ? urlMesas : null, { onError: (e) => avisar(e.message, "error") });
  const { datos: planes, refrescar: refPlan } = useDatos(quien ? urlPlan : null, { onError: () => {} });
  const cronograma = (planes || [])[0] || null;

  const recargar = useCallback(() => {
    invalidar(`/api/gc/contracts/${contratoId}/meetings`);
    invalidar(`/api/gc/contracts/${contratoId}/workplan`);
    refMesas(); refPlan();
  }, [contratoId, refMesas, refPlan]);

  const puedeGestionar = detalle.permisos.includes("DOCUMENT_UPLOAD");
  const puedeEliminar = detalle.rol !== "TRABAJADOR";

  async function subirCronograma() {
    if (!archivoPlan) return avisar("Selecciona el archivo del cronograma", "error");
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.set("file", archivoPlan);
      if (!esTrabajador && quien) fd.set("userId", quien);
      if (drawerPlan?.title) fd.set("title", drawerPlan.title);
      if (drawerPlan?.notes) fd.set("notes", drawerPlan.notes);
      await enviarForm(`/api/gc/contracts/${contratoId}/workplan`, "POST", fd);
      avisar("Cronograma cargado");
      setDrawerPlan(null); setArchivoPlan(null);
      recargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function crearMesa() {
    setGuardando(true);
    try {
      await enviarJson(`/api/gc/contracts/${contratoId}/meetings`, "POST",
        { ...drawerAlta, kind: "mesa", user_id: quien });
      avisar("Mesa de trabajo creada");
      setDrawerAlta(null);
      recargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function subir(mesa, kind, archivo) {
    if (!archivo) return;
    setSubiendo({ id: mesa.id, kind });
    try {
      const fd = new FormData();
      fd.set("meetingId", mesa.id);
      fd.set("kind", kind);
      fd.set("file", archivo);
      await enviarForm(`/api/gc/contracts/${contratoId}/meetings`, "PUT", fd);
      avisar(kind === "foto" ? "Fotografía agregada" : "Archivo anexado");
      recargar();
    } catch (e) { avisar(e.message, "error"); } finally { setSubiendo(null); }
  }

  async function eliminar() {
    const c = confirmar;
    setConfirmar(null);
    try {
      if (c.tipo === "cronograma") {
        await api(`/api/gc/contracts/${contratoId}/workplan?planId=${c.id}`, { method: "DELETE" });
        avisar("Cronograma retirado");
      } else {
        const query = c.tipo === "archivo" ? `fileId=${c.id}` : `meetingId=${c.id}`;
        await api(`/api/gc/contracts/${contratoId}/meetings?${query}`, { method: "DELETE" });
        avisar(c.tipo === "archivo" ? "Archivo retirado" : "Mesa eliminada");
      }
      recargar();
    } catch (e) { avisar(e.message, "error"); }
  }

  const ver = (mesa, archivo, tipo = "reunion") => setVisor({
    url: urlArchivo(tipo, archivo.id), file_name: archivo.file_name, titulo: archivo.file_name,
    mime_type: archivo.mime_type, size_bytes: archivo.size_bytes,
    autor: archivo.uploaded_by_name, fecha: archivo.created_at,
    contexto: mesa ? `Mesa de trabajo · ${mesa.title} · ${fmtFecha(mesa.meeting_date)}` : "Cronograma de trabajo",
  });

  const documento = (mesa, tipo, formato) =>
    `/api/gc/contracts/${contratoId}/meetings/documento?meetingId=${mesa.id}&tipo=${tipo}&formato=${formato}`;

  /* ---------- Sin persona elegida ---------- */
  if (!esTrabajador && !quien) {
    return (
      <section className="gc-card">
        <header className="gc-card-title"><h3>Mesas de trabajo por contratista</h3></header>
        {!participantes ? <Cargando filas={3} /> : participantes.length ? (
          <>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--gc-muted)", fontWeight: 700 }}>
              Elige a quién quieres consultar. Cada persona carga su propio cronograma y sus mesas de trabajo.
            </p>
            <div className="gc-list">
              {participantes.map((p) => (
                <button className="gc-item" key={p.user_id} onClick={() => setPersona(p.user_id)}>
                  <span className="gc-avatar" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 12 }}>
                    {p.has_photo ? <img src={`/api/profile/photo/${p.user_id}`} alt="" /> : iniciales(p.full_name)}
                  </span>
                  <span className="txt"><b>{p.full_name}</b><small>{p.specialty || p.cargo || "—"}</small></span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <Vacio icono={Users} titulo="El contrato no tiene contratistas"
            texto="Asocia participantes en la pestaña «Contratistas» para que registren sus mesas de trabajo." />
        )}
      </section>
    );
  }

  const nombrePersona = esTrabajador
    ? detalle.yo.full_name
    : (participantes || []).find((p) => p.user_id === quien)?.full_name || "Contratista";

  return (
    <>
      {/* Persona en curso */}
      {!esTrabajador && (
        <section className="gc-card" style={{ marginBottom: 14 }}>
          <div className="gc-card-title" style={{ margin: 0 }}>
            <h3>Mesas de trabajo · {nombrePersona}</h3>
            <div className="gc-actions">
              <BotonExportar contratoId={contratoId} seccion="reuniones" filtros={{ userId: quien }} />
              <button className="gc-btn ghost" onClick={() => setPersona(null)}><Users size={15} /> Cambiar persona</button>
            </div>
          </div>
        </section>
      )}

      {/* Paso 1 · Cronograma */}
      <section className="gc-card" style={{ marginBottom: 14 }}>
        <header className="gc-card-title">
          <h3><span className="gc-paso">1</span> Cronograma de trabajo</h3>
          {puedeGestionar && (
            <button className="gc-btn ghost" onClick={() => { setDrawerPlan({}); setArchivoPlan(null); }}>
              <Upload size={15} /> {cronograma ? "Reemplazar" : "Cargar cronograma"}
            </button>
          )}
        </header>
        {cronograma ? (
          <div className="gc-item" style={{ cursor: "default" }}>
            <IconoArchivo nombre={cronograma.file_name} />
            <span className="txt">
              <b>{cronograma.title || cronograma.file_name}</b>
              <small>{fmtTam(cronograma.size_bytes)} · cargado el {cronograma.created_at}</small>
              {cronograma.notes && <small style={{ color: "var(--gc-soft)" }}>{cronograma.notes}</small>}
            </span>
            <div className="gc-rowact">
              <button className="gc-icbtn" title="Ver" onClick={() => ver(null, cronograma, "cronograma")}><Eye size={14} /></button>
              <a className="gc-icbtn" title="Descargar" href={`${urlArchivo("cronograma", cronograma.id)}&download=1`}><Download size={14} /></a>
              {puedeGestionar && (
                <button className="gc-icbtn danger" title="Retirar"
                  onClick={() => setConfirmar({ tipo: "cronograma", id: cronograma.id, titulo: cronograma.file_name })}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <Vacio icono={CalendarRange} titulo="Todavía no hay cronograma"
            texto="Carga el cronograma de trabajo antes de registrar las mesas del periodo."
            accion={puedeGestionar && (
              <button className="gc-btn primary" onClick={() => { setDrawerPlan({}); setArchivoPlan(null); }}>
                <Upload size={15} /> Cargar cronograma
              </button>
            )} />
        )}
      </section>

      {/* Paso 2 · Mesas de trabajo */}
      <section className="gc-card flush">
        <header className="gc-card-title" style={{ padding: "16px 18px 0", margin: 0 }}>
          <h3><span className="gc-paso">2</span> Mesas de trabajo</h3>
          {puedeGestionar && (
            <button className="gc-btn primary" disabled={!cronograma}
              title={cronograma ? "" : "Primero carga el cronograma"}
              onClick={() => setDrawerAlta({ meeting_date: new Date().toISOString().slice(0, 10) })}>
              <Plus size={15} /> Nueva mesa
            </button>
          )}
        </header>

        {!mesas ? <div style={{ padding: 18 }}><Cargando filas={3} /></div>
          : !mesas.length ? (
            <div style={{ padding: "10px 18px 24px" }}>
              <Vacio icono={CalendarDays} titulo="Sin mesas de trabajo registradas"
                texto={cronograma
                  ? "Registra la primera mesa y anexa su acta, la asistencia y el registro fotográfico."
                  : "Carga primero el cronograma; después podrás registrar las mesas."} />
            </div>
          ) : (
            <div style={{ padding: "6px 18px 22px", display: "grid", gap: 12 }}>
              {mesas.map((m) => {
                const fotos = m.archivos.filter((a) => a.kind === "foto");
                const anexos = m.archivos.filter((a) => a.kind === "anexo");
                return (
                  <article className="gc-reunion" key={m.id}>
                    <header>
                      <span className="gc-reunion-fecha">
                        <b>{Number(m.meeting_date.slice(8, 10))}</b>
                        <small>{fmtFecha(m.meeting_date)}</small>
                      </span>
                      <div className="gc-reunion-titulo">
                        <b>{m.title}</b>
                        <small>{m.location && <><MapPin size={11} /> {m.location} · </>}{m.persona_name || nombrePersona}</small>
                      </div>
                      {puedeEliminar && (
                        <button className="gc-icbtn danger" title="Eliminar mesa"
                          onClick={() => setConfirmar({ tipo: "mesa", id: m.id, titulo: m.title })}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </header>
                    {m.description && <p className="gc-reunion-desc">{m.description}</p>}

                    {/* Acta y asistencia */}
                    <div className="gc-reunion-ranuras">
                      {RANURAS.map(({ kind, etiqueta, Icono }) => {
                        const archivo = m.archivos.find((a) => a.kind === kind);
                        const ocupado = subiendo?.id === m.id && subiendo?.kind === kind;
                        return (
                          <div className={`gc-ranura${archivo ? " llena" : ""}`} key={kind}>
                            <span className="gc-ranura-ico"><Icono size={15} /></span>
                            <span className="txt">
                              <b>{etiqueta}</b>
                              {archivo ? <small>{archivo.file_name} · {fmtTam(archivo.size_bytes)}</small>
                                : <small>Sin archivo · descárgala en PDF o Word</small>}
                            </span>
                            <div className="gc-rowact">
                              {archivo && <button className="gc-icbtn" title="Ver" onClick={() => ver(m, archivo)}><Eye size={14} /></button>}
                              <a className="gc-icbtn" title="Descargar en PDF" href={documento(m, kind, "pdf")}><FileDown size={14} /></a>
                              <a className="gc-icbtn" title="Descargar en Word" href={documento(m, kind, "word")}><FileType2 size={14} /></a>
                              {puedeGestionar && (
                                <label className="gc-icbtn" title="Anexar archivo" style={{ cursor: "pointer" }}>
                                  {ocupado ? <ClipboardCheck size={14} /> : <Upload size={14} />}
                                  <input type="file" hidden disabled={!!ocupado}
                                    onChange={(e) => { subir(m, kind, e.target.files?.[0]); e.target.value = ""; }} />
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Registro fotográfico */}
                    <div className="gc-fotos-bloque">
                      <div className="gc-fotos-cab">
                        <span><ImageIcon size={13} /> Registro fotográfico</span>
                        {puedeGestionar && (
                          <label className="gc-reunion-agregar">
                            <ImageIcon size={13} /> {subiendo?.id === m.id && subiendo?.kind === "foto" ? "Subiendo…" : "Agregar fotos"}
                            <input type="file" accept="image/*" multiple hidden
                              onChange={async (e) => {
                                for (const f of [...e.target.files]) await subir(m, "foto", f);
                                e.target.value = "";
                              }} />
                          </label>
                        )}
                      </div>
                      {fotos.length ? (
                        <div className="gc-fotos">
                          {fotos.map((f) => (
                            <figure key={f.id}>
                              <button onClick={() => ver(m, f)}>
                                <img src={urlArchivo("reunion", f.id)} alt={f.file_name} loading="lazy" />
                              </button>
                              {puedeGestionar && (
                                <button className="gc-foto-quitar" title="Retirar"
                                  onClick={() => setConfirmar({ tipo: "archivo", id: f.id, titulo: f.file_name })}>
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </figure>
                          ))}
                        </div>
                      ) : <p className="gc-fotos-vacio">Sin fotografías de la mesa.</p>}
                    </div>

                    {/* Otros soportes */}
                    {(anexos.length > 0 || puedeGestionar) && (
                      <div className="gc-reunion-anexos">
                        {anexos.map((a) => (
                          <div className="gc-item" key={a.id} style={{ cursor: "default" }}>
                            <IconoArchivo nombre={a.file_name} />
                            <span className="txt"><b>{a.file_name}</b><small>{fmtTam(a.size_bytes)} · {a.uploaded_by_name || "—"}</small></span>
                            <div className="gc-rowact">
                              <button className="gc-icbtn" title="Ver" onClick={() => ver(m, a)}><Eye size={14} /></button>
                              <button className="gc-icbtn danger" title="Retirar"
                                onClick={() => setConfirmar({ tipo: "archivo", id: a.id, titulo: a.file_name })}><Trash2 size={14} /></button>
                            </div>
                          </div>
                        ))}
                        {puedeGestionar && (
                          <label className="gc-reunion-agregar">
                            <Paperclip size={13} /> Agregar otro soporte
                            <input type="file" hidden
                              onChange={(e) => { subir(m, "anexo", e.target.files?.[0]); e.target.value = ""; }} />
                          </label>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
      </section>

      {/* Cronograma */}
      <Drawer abierto={!!drawerPlan} titulo="Cronograma de trabajo"
        subtitulo={`Se guarda como el cronograma vigente de ${nombrePersona}.`}
        onClose={() => setDrawerPlan(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawerPlan(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !archivoPlan} onClick={subirCronograma}>
            {guardando ? "Cargando…" : "Cargar cronograma"}
          </button>
        </>}>
        {drawerPlan && (
          <div className="gc-form">
            <div className="gc-field">
              <label>Archivo *</label>
              <input type="file" onChange={(e) => setArchivoPlan(e.target.files?.[0] || null)} />
              {archivoPlan && <span className="hint">{archivoPlan.name} · {fmtTam(archivoPlan.size)}</span>}
              {cronograma && <span className="hint">Se reemplazará el cronograma actual.</span>}
            </div>
            <div className="gc-field">
              <label>Título</label>
              <input value={drawerPlan.title || ""} onChange={(e) => setDrawerPlan({ ...drawerPlan, title: e.target.value })}
                placeholder="Cronograma agosto — diciembre 2026" />
            </div>
            <div className="gc-field">
              <label>Notas</label>
              <textarea rows={3} value={drawerPlan.notes || ""} onChange={(e) => setDrawerPlan({ ...drawerPlan, notes: e.target.value })}
                placeholder="Alcance, periodicidad de las mesas, observaciones…" />
            </div>
          </div>
        )}
      </Drawer>

      {/* Nueva mesa */}
      <Drawer abierto={!!drawerAlta} titulo="Nueva mesa de trabajo"
        subtitulo="Se crea fechada; después anexas el acta, la asistencia y las fotos."
        onClose={() => setDrawerAlta(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawerAlta(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !drawerAlta?.title?.trim() || !drawerAlta?.meeting_date} onClick={crearMesa}>
            {guardando ? "Creando…" : "Crear mesa"}
          </button>
        </>}>
        {drawerAlta && (
          <div className="gc-form c2">
            <div className="gc-field gc-full">
              <label>Tema de la mesa *</label>
              <input value={drawerAlta.title || ""} onChange={(e) => setDrawerAlta({ ...drawerAlta, title: e.target.value })}
                placeholder="Mesa de trabajo · revisión de expedientes" autoFocus />
            </div>
            <div className="gc-field">
              <label>Fecha *</label>
              <input type="date" value={drawerAlta.meeting_date || ""} onChange={(e) => setDrawerAlta({ ...drawerAlta, meeting_date: e.target.value })} />
            </div>
            <div className="gc-field">
              <label>Lugar</label>
              <input value={drawerAlta.location || ""} onChange={(e) => setDrawerAlta({ ...drawerAlta, location: e.target.value })}
                placeholder="Oficina / virtual / campo" />
            </div>
            <div className="gc-field gc-full">
              <label>Desarrollo</label>
              <textarea rows={3} value={drawerAlta.description || ""} onChange={(e) => setDrawerAlta({ ...drawerAlta, description: e.target.value })}
                placeholder="Temas tratados, avances, compromisos…" />
            </div>
          </div>
        )}
      </Drawer>

      <Confirmar abierto={!!confirmar}
        titulo={confirmar?.tipo === "mesa" ? "Eliminar mesa de trabajo"
          : confirmar?.tipo === "cronograma" ? "Retirar cronograma" : "Retirar archivo"}
        texto={confirmar?.tipo === "mesa"
          ? `Se eliminará «${confirmar?.titulo}» con su acta, asistencia y fotos.`
          : `Se retirará «${confirmar?.titulo}».`}
        etiqueta={confirmar?.tipo === "mesa" ? "Eliminar" : "Retirar"}
        onClose={() => setConfirmar(null)} onConfirmar={eliminar} />
    </>
  );
}
