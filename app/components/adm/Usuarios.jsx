"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BadgeCheck, BriefcaseBusiness, Copy, FileCheck2, KeyRound, MessageSquare,
  Pencil, Plus, Power, Search, ShieldCheck, UserRound, Users, X,
} from "lucide-react";
import { api, enviarJson } from "../gc/api";
import { useDatos, invalidar } from "../gc/cache";
import { Drawer, Confirmar, Toast, iniciales } from "../gc/ui";
import { sugerirUsuario } from "@/lib/adminSchema";

// Módulo de usuarios: la base administrativa de todas las cuentas del sistema.
// Cada persona se gestiona de forma independiente: datos, rol, estado,
// contraseña y su participación en contratos.

const FILTROS = [
  ["todos", "Todos"],
  ["activos", "Activos"],
  ["inactivos", "Inactivos"],
  ["admins", "Administradores"],
];

export default function Usuarios() {
  const [toast, setToast] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [seleccion, setSeleccion] = useState(null); // usuario abierto en el panel
  const [editar, setEditar] = useState(null); // formulario de edición
  const [alta, setAlta] = useState(null); // formulario de creación
  const [credencial, setCredencial] = useState(null); // clave mostrada una vez
  const [confirmar, setConfirmar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const avisar = useCallback((msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), tipo === "error" ? 5000 : 2600);
  }, []);

  const { datos, cargando, refrescar } = useDatos("/api/adm/users", {
    onError: (e) => avisar(e.message, "error"),
  });
  const usuarios = datos?.usuarios || [];

  // El panel abierto se mantiene apuntando a la versión fresca del usuario.
  useEffect(() => {
    if (seleccion) {
      const fresco = usuarios.find((u) => u.id === seleccion.id);
      if (fresco && fresco !== seleccion) setSeleccion(fresco);
    }
  }, [usuarios]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return usuarios
      .filter((u) => filtro === "todos" ? true
        : filtro === "activos" ? u.is_active
        : filtro === "inactivos" ? !u.is_active
        : u.role === "admin")
      .filter((u) => !q || `${u.full_name} ${u.username || ""} ${u.email || ""} ${u.cedula || ""} ${u.cargo || ""}`.toLowerCase().includes(q));
  }, [usuarios, busca, filtro]);

  const kpis = [
    { label: "Cuentas", valor: usuarios.length, Icono: Users },
    { label: "Activas", valor: usuarios.filter((u) => u.is_active).length, Icono: BadgeCheck },
    { label: "Administradores", valor: usuarios.filter((u) => u.role === "admin").length, Icono: ShieldCheck },
    { label: "En contratos", valor: usuarios.filter((u) => u.contratos > 0).length, Icono: BriefcaseBusiness },
  ];

  async function crear() {
    setGuardando(true);
    try {
      const r = await enviarJson("/api/adm/users", "POST", alta);
      invalidar("/api/adm/");
      setAlta(null);
      setCredencial({ ...r, titulo: "Usuario creado" });
      refrescar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function guardar() {
    setGuardando(true);
    try {
      await enviarJson("/api/adm/users", "PATCH", { ...editar, userId: editar.id });
      invalidar("/api/adm/");
      setEditar(null);
      avisar("Cuenta actualizada");
      refrescar();
    } catch (e) { avisar(e.message, "error"); } finally { setGuardando(false); }
  }

  async function restablecer(u) {
    setConfirmar(null);
    try {
      const r = await enviarJson("/api/adm/users", "PATCH", { userId: u.id, accion: "reset" });
      setCredencial({ ...r, titulo: "Contraseña restablecida" });
    } catch (e) { avisar(e.message, "error"); }
  }

  async function cambiarEstado(u) {
    setConfirmar(null);
    try {
      await enviarJson("/api/adm/users", "PATCH", { userId: u.id, accion: "estado", is_active: !u.is_active });
      invalidar("/api/adm/");
      avisar(u.is_active ? `${u.full_name} desactivado` : `${u.full_name} reactivado`);
      refrescar();
    } catch (e) { avisar(e.message, "error"); }
  }

  if (cargando) return <div className="gc-loading"><span className="gc-spin" /> Cargando usuarios…</div>;
  if (!datos) {
    return (
      <div className="gc-loading" style={{ flexDirection: "column", gap: 16 }}>
        <span>Necesitas una cuenta de administrador para gestionar usuarios.</span>
        <a className="gc-btn primary" href="/">Volver al repositorio</a>
      </div>
    );
  }

  return (
    <div className="usr-shell">
      <header className="usr-top">
        <div className="usr-top-izq">
          <a className="usr-volver" href="/"><ArrowLeft size={16} /> Repositorio</a>
          <div>
            <span className="eyebrow">Administración</span>
            <h1>Usuarios del sistema</h1>
            <p>La base administrativa de todas las cuentas: datos, roles, acceso y contratos de cada persona.</p>
          </div>
        </div>
        <button className="gc-btn primary" onClick={() => setAlta({ role: "usuario" })}><Plus size={15} /> Nuevo usuario</button>
      </header>

      <div className="usr-kpis">
        {kpis.map((k) => (
          <article key={k.label}><i><k.Icono size={17} /></i><strong>{k.valor}</strong><span>{k.label}</span></article>
        ))}
      </div>

      <div className="usr-toolbar">
        <div className="usr-buscar">
          <Search size={16} />
          <input placeholder="Buscar por nombre, usuario, correo, cédula o cargo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {busca && <button onClick={() => setBusca("")}><X size={14} /></button>}
        </div>
        <div className="usr-filtros">
          {FILTROS.map(([id, etiqueta]) => (
            <button key={id} className={filtro === id ? "on" : ""} onClick={() => setFiltro(id)}>{etiqueta}</button>
          ))}
        </div>
      </div>

      <div className={`usr-layout${seleccion ? " con-panel" : ""}`}>
        <div className="usr-tabla" role="table">
          <div className="usr-fila usr-cabecera" role="row">
            <span>Persona</span><span>Usuario</span><span>Rol</span><span>Contratos</span><span>Estado</span><span />
          </div>
          {visibles.map((u) => (
            <div key={u.id} role="row"
              className={`usr-fila${seleccion?.id === u.id ? " abierta" : ""}${u.is_active ? "" : " inactiva"}`}
              onClick={() => setSeleccion(seleccion?.id === u.id ? null : u)}>
              <span className="usr-persona">
                {u.has_photo
                  ? <img src={`/api/profile/photo/${u.id}`} alt="" />
                  : <i>{iniciales(u.full_name)}</i>}
                <span><b>{u.full_name}</b><small>{u.cargo || "Sin cargo"}</small></span>
              </span>
              <span className="usr-mono">{u.username || u.email || "—"}</span>
              <span>{u.role === "admin"
                ? <em className="usr-chip admin"><ShieldCheck size={11} /> Admin</em>
                : <em className="usr-chip">Usuario</em>}</span>
              <span className="usr-num">{u.contratos}</span>
              <span>{u.is_active
                ? <em className="usr-chip activa">Activa</em>
                : <em className="usr-chip baja">Inactiva</em>}</span>
              <span className="usr-acciones" onClick={(e) => e.stopPropagation()}>
                <button title="Editar" onClick={() => setEditar({ ...u })}><Pencil size={14} /></button>
                <button title="Restablecer contraseña"
                  onClick={() => setConfirmar({ tipo: "reset", u })}><KeyRound size={14} /></button>
                <button title={u.is_active ? "Desactivar" : "Reactivar"} className={u.is_active ? "peligro" : "verde"}
                  onClick={() => setConfirmar({ tipo: "estado", u })}><Power size={14} /></button>
              </span>
            </div>
          ))}
          {!visibles.length && (
            <div className="usr-vacio"><UserRound size={22} /><p>Ningún usuario coincide con la búsqueda.</p></div>
          )}
        </div>

        {seleccion && (
          <aside className="usr-panel">
            <header>
              <div className="usr-persona grande">
                {seleccion.has_photo
                  ? <img src={`/api/profile/photo/${seleccion.id}`} alt="" />
                  : <i>{iniciales(seleccion.full_name)}</i>}
                <span><b>{seleccion.full_name}</b><small>{seleccion.cargo || "Sin cargo"}</small></span>
              </div>
              <button onClick={() => setSeleccion(null)}><X size={16} /></button>
            </header>
            <dl>
              <div><dt>Usuario</dt><dd className="usr-mono">{seleccion.username || "—"}</dd></div>
              <div><dt>Correo</dt><dd>{seleccion.email || "—"}</dd></div>
              <div><dt>Cédula</dt><dd>{seleccion.cedula || "—"}</dd></div>
              <div><dt>Alta</dt><dd>{seleccion.created_at || "—"}</dd></div>
            </dl>
            <div className="usr-metricas">
              <span><BriefcaseBusiness size={14} /> {seleccion.contratos} contratos</span>
              <span><FileCheck2 size={14} /> {seleccion.entregas} entregas</span>
              <span><MessageSquare size={14} /> {seleccion.aportes} aportes</span>
            </div>
            <h4>Contratos donde participa</h4>
            {seleccion.participaciones.length ? (
              <div className="usr-contratos">
                {seleccion.participaciones.map((p) => (
                  <a key={p.contract_id} href={`/gestion-contractual/contrato/${p.contract_id}/resumen`}>
                    <b>{p.title}</b>
                    <small>{p.role_in_contract} · {p.status}</small>
                  </a>
                ))}
              </div>
            ) : <p className="usr-sin">No participa en ningún contrato.</p>}
            <footer>
              <button className="gc-btn ghost" onClick={() => setEditar({ ...seleccion })}><Pencil size={14} /> Editar</button>
              <button className="gc-btn ghost" onClick={() => setConfirmar({ tipo: "reset", u: seleccion })}><KeyRound size={14} /> Nueva clave</button>
              <button className={`gc-btn ${seleccion.is_active ? "danger" : "primary"}`}
                onClick={() => setConfirmar({ tipo: "estado", u: seleccion })}>
                <Power size={14} /> {seleccion.is_active ? "Desactivar" : "Reactivar"}
              </button>
            </footer>
          </aside>
        )}
      </div>

      {/* Alta */}
      <Drawer abierto={!!alta} titulo="Nuevo usuario" subtitulo="Se genera una contraseña temporal que se muestra una sola vez."
        onClose={() => setAlta(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setAlta(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando} onClick={crear}>{guardando ? "Creando…" : "Crear usuario"}</button>
        </>}>
        {alta && <FormularioUsuario datos={alta} setDatos={setAlta} esAlta />}
      </Drawer>

      {/* Edición */}
      <Drawer abierto={!!editar} titulo="Editar cuenta" subtitulo={editar?.full_name}
        onClose={() => setEditar(null)}
        pie={<>
          <button className="gc-btn ghost" onClick={() => setEditar(null)}>Cancelar</button>
          <button className="gc-btn primary" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
        </>}>
        {editar && <FormularioUsuario datos={editar} setDatos={setEditar} />}
      </Drawer>

      {/* Confirmaciones */}
      <Confirmar abierto={confirmar?.tipo === "reset"} titulo="Restablecer contraseña"
        texto={`Se generará una contraseña temporal para ${confirmar?.u?.full_name}. La actual dejará de funcionar de inmediato.`}
        etiqueta="Restablecer" tono="warn"
        onClose={() => setConfirmar(null)} onConfirmar={() => restablecer(confirmar.u)} />
      <Confirmar abierto={confirmar?.tipo === "estado"}
        titulo={confirmar?.u?.is_active ? "Desactivar cuenta" : "Reactivar cuenta"}
        texto={confirmar?.u?.is_active
          ? `${confirmar?.u?.full_name} no podrá iniciar sesión y saldrá de los contratos donde participa.`
          : `${confirmar?.u?.full_name} podrá volver a iniciar sesión con su contraseña actual.`}
        etiqueta={confirmar?.u?.is_active ? "Desactivar" : "Reactivar"}
        tono={confirmar?.u?.is_active ? "danger" : "warn"}
        onClose={() => setConfirmar(null)} onConfirmar={() => cambiarEstado(confirmar.u)} />

      {/* Credencial: se muestra una única vez */}
      {credencial && (
        <>
          <div className="gc-overlay" onClick={() => setCredencial(null)} />
          <div className="gc-modal" style={{ maxWidth: 460 }}>
            <h3>{credencial.titulo}</h3>
            <p>Entrega estos datos a <b>{credencial.full_name}</b>. La contraseña no se vuelve a mostrar.</p>
            <div className="usr-credencial">
              <div><span>Usuario</span><b>{credencial.username}</b></div>
              <div><span>Contraseña temporal</span><b>{credencial.clave}</b></div>
            </div>
            <div className="gc-modal-foot">
              <button className="gc-btn ghost" onClick={() => {
                navigator.clipboard?.writeText(`Usuario: ${credencial.username}\nContraseña: ${credencial.clave}`);
                avisar("Credenciales copiadas");
              }}><Copy size={14} /> Copiar</button>
              <button className="gc-btn primary" onClick={() => setCredencial(null)}>Entendido</button>
            </div>
          </div>
        </>
      )}

      <Toast toast={toast} />
    </div>
  );
}

function FormularioUsuario({ datos, setDatos, esAlta = false }) {
  const sugerido = esAlta ? sugerirUsuario(datos.full_name) : "";
  return (
    <div className="gc-form c2">
      <div className="gc-field gc-full">
        <label>Nombre completo *</label>
        <input value={datos.full_name || ""} onChange={(e) => setDatos({ ...datos, full_name: e.target.value })}
          placeholder="Natalia Forero Bejarano" autoFocus={esAlta} />
      </div>
      <div className="gc-field">
        <label>Usuario *</label>
        <input value={datos.username ?? sugerido} onChange={(e) => setDatos({ ...datos, username: e.target.value })}
          placeholder="natalia.forero" />
        <span className="hint">Con esto inicia sesión.</span>
      </div>
      <div className="gc-field">
        <label>Correo electrónico</label>
        <input type="email" value={datos.email || ""} onChange={(e) => setDatos({ ...datos, email: e.target.value })}
          placeholder="opcional" />
        <span className="hint">Opcional. También sirve para entrar.</span>
      </div>
      <div className="gc-field">
        <label>Cédula</label>
        <input value={datos.cedula || ""} onChange={(e) => setDatos({ ...datos, cedula: e.target.value })} placeholder="1010101010" />
      </div>
      <div className="gc-field">
        <label>Cargo</label>
        <input value={datos.cargo || ""} onChange={(e) => setDatos({ ...datos, cargo: e.target.value })} placeholder="Supervisora de contrato" />
      </div>
      <div className="gc-field gc-full">
        <label>Rol en el sistema</label>
        <select value={datos.role || "usuario"} onChange={(e) => setDatos({ ...datos, role: e.target.value })}>
          <option value="usuario">Usuario</option>
          <option value="admin">Administrador (acceso total a la plataforma)</option>
        </select>
      </div>
    </div>
  );
}
