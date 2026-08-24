"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { api, enviarJson } from "./api";
import { Cargando, Confirmar, Drawer, Vacio, fmtFecha, iniciales } from "./ui";

const ROLES = [
  ["supervisor", "Supervisor"], ["contratista", "Contratista"], ["apoyo", "Apoyo administrativo"],
  ["tecnico", "Técnico"], ["financiero", "Financiero"], ["juridico", "Jurídico"], ["revisor", "Revisor"],
];
const COLUMNAS = "minmax(0,1fr) 150px 120px 110px 90px";

export default function TabContratistas({ contratoId, detalle, avisar, ir }) {
  const [lista, setLista] = useState(null);
  const [directorio, setDirectorio] = useState([]);
  const [drawer, setDrawer] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try { setLista(await api(`/api/gc/contracts/${contratoId}/participants`)); }
    catch (e) { avisar(e.message, "error"); setLista([]); }
  }, [contratoId, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  async function abrirAlta() {
    try { setDirectorio(await api(`/api/gc/users?contractId=${contratoId}`)); }
    catch (e) { avisar(e.message, "error"); }
    setDrawer({ role_in_contract: "contratista", status: "activo" });
  }

  async function guardar() {
    setGuardando(true);
    try {
      await enviarJson(`/api/gc/contracts/${contratoId}/participants`, "POST", drawer);
      avisar(drawer.editando ? "Participante actualizado" : "Participante asociado");
      setDrawer(null); cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function retirar(p) {
    try {
      await api(`/api/gc/contracts/${contratoId}/participants?userId=${p.user_id}`, { method: "DELETE" });
      avisar("Participante retirado");
      setConfirmar(null); cargar();
    } catch (e) { avisar(e.message, "error"); setConfirmar(null); }
  }

  if (!lista) return <section className="gc-card"><Cargando filas={4} /></section>;

  const puedeGestionar = detalle.permisos.includes("PARTICIPANT_MANAGE");
  const yaAsociados = new Set(lista.map((p) => p.user_id));

  return (
    <>
      <section className="gc-card flush">
        <header className="gc-card-title" style={{ padding: "16px 18px 0", margin: 0 }}>
          <h3>Participantes del contrato</h3>
          {puedeGestionar && <button className="gc-btn primary" onClick={abrirAlta}><UserPlus size={15} /> Asociar participante</button>}
        </header>

        {lista.length ? (
          <div className="gc-table" style={{ marginTop: 14 }}>
            <div className="gc-thead" style={{ gridTemplateColumns: COLUMNAS }}>
              <span>Persona</span><span>Rol contractual</span><span>Actividades</span><span>Evidencias</span><span style={{ textAlign: "right" }}>Acciones</span>
            </div>
            {lista.map((p) => (
              <div className="gc-trow" key={p.id} style={{ gridTemplateColumns: COLUMNAS }}>
                <div className="gc-cell-main">
                  <span className="gc-avatar" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 12 }}>
                    {p.has_photo ? <img src={`/api/profile/photo/${p.user_id}`} alt="" /> : iniciales(p.full_name)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b>{p.full_name}</b>
                    <small>{p.specialty || p.cargo || "Sin especialidad"}{p.email ? ` · ${p.email}` : ""}</small>
                  </div>
                </div>
                <span className="gc-cell">
                  <span className={`gc-badge ${p.role_in_contract === "supervisor" ? "info" : "muted"}`}>
                    {ROLES.find(([v]) => v === p.role_in_contract)?.[1] || p.role_in_contract}
                  </span>
                </span>
                <span className="gc-cell">{p.actividades}</span>
                <span className="gc-cell">{p.evidencias_validadas} validadas</span>
                <div className="gc-rowact">
                  <button className="gc-icbtn" title="Ver actividades" onClick={() => ir("contrato", contratoId, "actividades", p.user_id)}><ClipboardList size={14} /></button>
                  <button className="gc-icbtn" title="Ver evidencias" onClick={() => ir("contrato", contratoId, "evidencias", p.user_id)}><ShieldCheck size={14} /></button>
                  {puedeGestionar && <button className="gc-icbtn danger" title="Retirar" onClick={() => setConfirmar(p)}><UserMinus size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            <Vacio icono={Users} titulo="El contrato no tiene participantes"
              texto="Asocia a las personas que ejecutan el contrato para hacerles seguimiento."
              accion={puedeGestionar && <button className="gc-btn primary" onClick={abrirAlta}><UserPlus size={15} /> Asociar participante</button>} />
          </div>
        )}
      </section>

      <Drawer abierto={!!drawer} titulo="Asociar participante"
        subtitulo="El rol define qué puede hacer esta persona dentro del contrato."
        onClose={() => setDrawer(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setDrawer(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !drawer?.user_id} onClick={guardar}>
            {guardando ? "Guardando…" : "Asociar"}
          </button>
        </>}>
        {drawer && (
          <div className="gc-form c2">
            <div className="gc-field gc-full">
              <label>Persona *</label>
              <select value={drawer.user_id || ""} onChange={(e) => setDrawer({ ...drawer, user_id: e.target.value })}>
                <option value="">Selecciona del directorio</option>
                {directorio.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}{u.cargo ? ` — ${u.cargo}` : ""}{yaAsociados.has(u.id) ? " (ya asociado)" : ""}</option>
                ))}
              </select>
            </div>
            <div className="gc-field">
              <label>Rol contractual</label>
              <select value={drawer.role_in_contract} onChange={(e) => setDrawer({ ...drawer, role_in_contract: e.target.value })}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <span className="hint">«Supervisor» y «Revisor» pueden validar y aprobar.</span>
            </div>
            <div className="gc-field">
              <label>Estado</label>
              <select value={drawer.status} onChange={(e) => setDrawer({ ...drawer, status: e.target.value })}>
                <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
              </select>
            </div>
            <div className="gc-field gc-full">
              <label>Especialidad</label>
              <input value={drawer.specialty || ""} onChange={(e) => setDrawer({ ...drawer, specialty: e.target.value })} placeholder="Ingeniero residente, abogada senior…" />
            </div>
            <div className="gc-field"><label>Inicio</label><input type="date" value={drawer.start_date || ""} onChange={(e) => setDrawer({ ...drawer, start_date: e.target.value })} /></div>
            <div className="gc-field"><label>Fin</label><input type="date" value={drawer.end_date || ""} onChange={(e) => setDrawer({ ...drawer, end_date: e.target.value })} /></div>
          </div>
        )}
      </Drawer>

      <Confirmar abierto={!!confirmar} titulo="Retirar participante"
        texto={`Se retirará a ${confirmar?.full_name} del contrato. Solo es posible si no tiene actividades ni evidencias registradas.`}
        etiqueta="Retirar" onClose={() => setConfirmar(null)} onConfirmar={() => retirar(confirmar)} />
    </>
  );
}
