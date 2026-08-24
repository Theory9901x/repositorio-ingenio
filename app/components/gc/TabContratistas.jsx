"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Copy, KeyRound, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { api, enviarJson } from "./api";
import { invalidar, useDatos } from "./cache";
import { Cargando, Confirmar, Drawer, Vacio, fmtFecha, iniciales } from "./ui";

const ROLES = [
  ["supervisor", "Supervisor"], ["contratista", "Contratista"], ["apoyo", "Apoyo administrativo"],
  ["tecnico", "Técnico"], ["financiero", "Financiero"], ["juridico", "Jurídico"], ["revisor", "Revisor"],
];
const COLUMNAS = "minmax(0,1fr) 150px 120px 110px 90px";

// "Natalia Forero Bejarano" → "natalia.forero". Debe coincidir con el criterio
// del servidor para que el usuario mostrado sea el que se guarda.
function sugerirUsuario(nombreCompleto) {
  const partes = String(nombreCompleto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  return (partes[1] ? `${partes[0]}.${partes[1]}` : partes[0]).slice(0, 60);
}

export default function TabContratistas({ contratoId, detalle, avisar, ir }) {
  const [directorio, setDirectorio] = useState([]);
  const [drawer, setDrawer] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [alta, setAlta] = useState(null);        // formulario de usuario nuevo
  const [credencial, setCredencial] = useState(null); // se muestra una sola vez
  const [reinicio, setReinicio] = useState(null);
  const [gestionar, setGestionar] = useState(false); // directorio de usuarios
  const [busca, setBusca] = useState("");

  const { datos: listaRaw, refrescar } = useDatos(`/api/gc/contracts/${contratoId}/participants`, { onError: (e) => avisar(e.message, "error") });
  const lista = Array.isArray(listaRaw) ? listaRaw : listaRaw ? [] : null;
  const cargar = useCallback(() => { invalidar(`/api/gc/contracts/${contratoId}/`); return refrescar(); }, [contratoId, refrescar]);

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

  // Crea la cuenta y la asocia al contrato en un solo paso.
  async function crearUsuario() {
    setGuardando(true);
    try {
      const r = await enviarJson("/api/gc/users", "POST", { ...alta, username: alta.username ?? sugerirUsuario(alta.full_name) });
      await enviarJson(`/api/gc/contracts/${contratoId}/participants`, "POST", {
        user_id: r.id, role_in_contract: alta.role_in_contract, specialty: alta.cargo, status: "activo",
      });
      setCredencial({ ...r, titulo: "Usuario creado" });
      setAlta(null);
      setDirectorio(await api(`/api/gc/users?contractId=${contratoId}`).catch(() => directorio));
      cargar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  // Acepta tanto participantes (user_id) como usuarios del directorio (id).
  async function restablecer(p) {
    try {
      const r = await enviarJson("/api/gc/users", "PATCH", { userId: p.user_id ?? p.id });
      setCredencial({ ...r, titulo: "Contraseña restablecida" });
      setReinicio(null);
    } catch (e) { avisar(e.message, "error"); setReinicio(null); }
  }

  async function abrirDirectorio() {
    try {
      setDirectorio(await api(`/api/gc/users?contractId=${contratoId}`));
      setBusca("");
      setGestionar(true);
    } catch (e) { avisar(e.message, "error"); }
  }

  async function asociarDesdeDirectorio(u, rol = "contratista") {
    try {
      await enviarJson(`/api/gc/contracts/${contratoId}/participants`, "POST", {
        user_id: u.id, role_in_contract: rol, status: "activo",
      });
      avisar(`${u.full_name} asociado al contrato`);
      cargar();
    } catch (e) { avisar(e.message, "error"); }
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
  const esAdmin = detalle.rol === "ADMIN";
  const yaAsociados = new Set(lista.map((p) => p.user_id));
  const sugerido = sugerirUsuario(alta?.full_name);

  return (
    <>
      <section className="gc-card flush">
        <header className="gc-card-title" style={{ padding: "16px 18px 0", margin: 0 }}>
          <h3>Participantes del contrato</h3>
          <div className="gc-actions">
            {esAdmin && (
              <>
                <button className="gc-btn ghost" onClick={abrirDirectorio}>
                  <KeyRound size={15} /> Usuarios y contraseñas
                </button>
                <button className="gc-btn ghost" onClick={() => setAlta({ role_in_contract: "contratista", cargo: "" })}>
                  <UserPlus size={15} /> Crear usuario nuevo
                </button>
              </>
            )}
            {puedeGestionar && <button className="gc-btn primary" onClick={abrirAlta}><UserPlus size={15} /> Asociar participante</button>}
          </div>
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
                  {esAdmin && <button className="gc-icbtn" title="Restablecer contraseña" onClick={() => setReinicio(p)}><KeyRound size={14} /></button>}
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

      {/* Directorio: usuario y contraseña de cualquier persona */}
      <Drawer abierto={gestionar} titulo="Usuarios y contraseñas"
        subtitulo="El usuario es el correo. La contraseña se genera aquí y se muestra una sola vez."
        onClose={() => setGestionar(false)}>
        <div className="gc-field">
          <label>Buscar</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nombre o correo…" autoFocus />
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {directorio
            .filter((u) => !busca.trim() || `${u.full_name} ${u.username || ""} ${u.email || ""}`.toLowerCase().includes(busca.trim().toLowerCase()))
            .map((u) => (
              <div className="gc-item" key={u.id} style={{ cursor: "default" }}>
                <span className="gc-avatar" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 12 }}>
                  {u.has_photo ? <img src={`/api/profile/photo/${u.id}`} alt="" /> : iniciales(u.full_name)}
                </span>
                <span className="txt">
                  <b>{u.full_name}</b>
                  <small style={{ fontFamily: "'JetBrains Mono', monospace" }}>{u.username || u.email || "sin usuario"}</small>
                  <small>
                    {u.cargo || "Sin cargo"}
                    {u.role === "admin" && <span className="gc-badge info" style={{ marginLeft: 6 }}>Administrador</span>}
                    {yaAsociados.has(u.id) && <span className="gc-badge ok" style={{ marginLeft: 6 }}>En el contrato</span>}
                  </small>
                </span>
                <div className="gc-rowact">
                  {!yaAsociados.has(u.id) && (
                    <button className="gc-icbtn" title="Asociar al contrato" onClick={() => asociarDesdeDirectorio(u)}>
                      <UserPlus size={14} />
                    </button>
                  )}
                  <button className="gc-btn ghost" style={{ padding: "7px 12px" }}
                    onClick={() => setReinicio({ ...u, full_name: u.full_name })}>
                    <KeyRound size={14} /> Contraseña
                  </button>
                </div>
              </div>
            ))}
          {!directorio.length && (
            <p style={{ fontSize: 12.5, color: "var(--gc-muted)", fontWeight: 700, margin: 0 }}>No hay usuarios activos.</p>
          )}
        </div>
      </Drawer>

      {/* Alta de usuario nuevo */}
      <Drawer abierto={!!alta} titulo="Crear usuario nuevo"
        subtitulo="Se genera una contraseña temporal y la persona queda asociada a este contrato."
        onClose={() => setAlta(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setAlta(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando || !alta?.full_name?.trim() || !alta?.cedula?.trim()} onClick={crearUsuario}>
            {guardando ? "Creando…" : "Crear usuario"}
          </button>
        </>}>
        {alta && (
          <div className="gc-form c2">
            <div className="gc-field gc-full">
              <label>Nombre completo *</label>
              <input value={alta.full_name || ""} onChange={(e) => setAlta({ ...alta, full_name: e.target.value })}
                placeholder="Natalia Forero Bejarano" autoFocus />
            </div>
            <div className="gc-field">
              <label>Usuario *</label>
              <input value={alta.username ?? sugerido} onChange={(e) => setAlta({ ...alta, username: e.target.value })}
                placeholder="natalia.forero" />
              <span className="hint">Con esto inicia sesión. Se sugiere a partir del nombre.</span>
            </div>
            <div className="gc-field">
              <label>Correo electrónico</label>
              <input type="email" value={alta.email || ""} onChange={(e) => setAlta({ ...alta, email: e.target.value })}
                placeholder="opcional" />
              <span className="hint">Opcional. También sirve para entrar.</span>
            </div>
            <div className="gc-field">
              <label>Cédula *</label>
              <input value={alta.cedula || ""} onChange={(e) => setAlta({ ...alta, cedula: e.target.value })} placeholder="1010101010" />
            </div>
            <div className="gc-field">
              <label>Cargo</label>
              <input value={alta.cargo || ""} onChange={(e) => setAlta({ ...alta, cargo: e.target.value })} placeholder="Supervisora de contrato" />
            </div>
            <div className="gc-field">
              <label>Rol en este contrato</label>
              <select value={alta.role_in_contract} onChange={(e) => setAlta({ ...alta, role_in_contract: e.target.value })}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="gc-field gc-full">
              <label>Rol en el sistema</label>
              <select value={alta.role || "usuario"} onChange={(e) => setAlta({ ...alta, role: e.target.value })}>
                <option value="usuario">Usuario</option>
                <option value="admin">Administrador (acceso total a la plataforma)</option>
              </select>
              <span className="hint">El rol del contrato define qué puede hacer dentro de él; el del sistema, en toda la plataforma.</span>
            </div>
          </div>
        )}
      </Drawer>

      {/* Credencial: se muestra una única vez */}
      {credencial && (
        <>
          <div className="gc-overlay" onClick={() => setCredencial(null)} />
          <div className="gc-modal" style={{ maxWidth: 460 }}>
            <h3>{credencial.titulo}</h3>
            <p>
              Entrega estos datos a <b>{credencial.full_name}</b>. La contraseña no se vuelve a mostrar:
              si se pierde, hay que restablecerla de nuevo.
            </p>
            <div style={{ display: "grid", gap: 10, background: "rgba(123,92,250,.08)", borderRadius: 14, padding: 15, marginBottom: 16 }}>
              <div>
                <span style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gc-muted)" }}>Usuario</span>
                <b style={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>{credencial.username || credencial.email}</b>
              </div>
              <div>
                <span style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gc-muted)" }}>Contraseña temporal</span>
                <b style={{ fontSize: 16, fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".02em" }}>{credencial.clave}</b>
              </div>
            </div>
            <div className="gc-modal-foot">
              <button className="gc-btn ghost" onClick={() => {
                navigator.clipboard?.writeText(`Usuario: ${credencial.username || credencial.email}\nContraseña: ${credencial.clave}`);
                avisar("Credenciales copiadas");
              }}><Copy size={14} /> Copiar</button>
              <button className="gc-btn primary" onClick={() => setCredencial(null)}>Entendido</button>
            </div>
          </div>
        </>
      )}

      <Confirmar abierto={!!reinicio} titulo="Restablecer contraseña"
        texto={`Se generará una contraseña temporal para ${reinicio?.full_name}. La actual dejará de funcionar de inmediato.`}
        etiqueta="Restablecer" tono="warn"
        onClose={() => setReinicio(null)} onConfirmar={() => restablecer(reinicio)} />

      <Confirmar abierto={!!confirmar} titulo="Retirar participante"
        texto={`Se retirará a ${confirmar?.full_name} del contrato. Solo es posible si no tiene actividades ni evidencias registradas.`}
        etiqueta="Retirar" onClose={() => setConfirmar(null)} onConfirmar={() => retirar(confirmar)} />
    </>
  );
}
