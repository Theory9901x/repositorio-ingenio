"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock3, FileUp, Inbox, RefreshCw, Upload,
} from "lucide-react";

// Los estados que puede tener la entrega de una persona ante una solicitud.
const ESTADOS = {
  pendiente: { etiqueta: "Pendiente", clase: "pendiente", Icono: Clock3 },
  enviado: { etiqueta: "En revisión", clase: "revision", Icono: RefreshCw },
  aprobado: { etiqueta: "Aprobada", clase: "aprobada", Icono: CheckCircle2 },
  rechazado: { etiqueta: "Rechazada", clase: "rechazada", Icono: AlertTriangle },
  requiere_ajuste: { etiqueta: "Requiere ajuste", clase: "ajuste", Icono: AlertTriangle },
};

const FILTROS = [
  ["todo", "Todas"],
  ["pendiente", "Pendientes"],
  ["enviado", "En revisión"],
  ["aprobado", "Aprobadas"],
  ["por_corregir", "Por corregir"],
];

function vencimiento(s) {
  if (s.dias_restantes === null || s.dias_restantes === undefined) return "Sin fecha límite";
  if (s.dias_restantes < 0) return `Vencida hace ${Math.abs(s.dias_restantes)} día(s)`;
  if (s.dias_restantes === 0) return "Vence hoy";
  return `Faltan ${s.dias_restantes} día(s)`;
}

export default function MisPendientes({ compacto = false, onVerTodo }) {
  const [datos, setDatos] = useState(null);
  const [filtro, setFiltro] = useState("todo");

  const cargar = useCallback(async () => {
    const r = await fetch("/api/pendientes", { cache: "no-store" });
    const d = await r.json().catch(() => null);
    setDatos(d && !d.error ? d : { resumen: {}, solicitudes: [] });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (!datos) return <div className="pendientes-cargando">Cargando tus pendientes…</div>;

  const { resumen, solicitudes } = datos;
  const tarjetas = [
    { id: "pendiente", valor: resumen.pendientes || 0, texto: "Por entregar", Icono: Clock3 },
    { id: "enviado", valor: resumen.en_revision || 0, texto: "En revisión", Icono: RefreshCw },
    { id: "aprobado", valor: resumen.aprobadas || 0, texto: "Aprobadas", Icono: CheckCircle2 },
    { id: "por_corregir", valor: resumen.por_corregir || 0, texto: "Por corregir", Icono: AlertTriangle },
  ];

  // La versión compacta es la tira que aparece sobre la consulta documental.
  if (compacto) {
    const urgentes = (resumen.pendientes || 0) + (resumen.por_corregir || 0);
    if (!urgentes) return null;
    return (
      <button className="pendientes-tira" onClick={onVerTodo}>
        <span className="pendientes-tira-ico"><ClipboardList size={18} /></span>
        <span>
          <b>Tienes {urgentes} documento(s) por entregar</b>
          <small>{resumen.vencidas ? `${resumen.vencidas} con el plazo vencido · ` : ""}Entra para cargarlos</small>
        </span>
        <FileUp size={17} />
      </button>
    );
  }

  const visibles = solicitudes.filter((s) =>
    filtro === "todo" ? true
      : filtro === "por_corregir" ? ["rechazado", "requiere_ajuste"].includes(s.estado)
      : s.estado === filtro
  );

  return (
    <section className="pendientes">
      <header className="pendientes-head">
        <div>
          <span className="eyebrow">Lo tuyo</span>
          <h2>Mis solicitudes</h2>
          <p>Todo lo que te han pedido en los contratos donde participas. Entra y carga desde aquí.</p>
        </div>
        <button className="chip-btn" onClick={cargar}><RefreshCw size={15} /> Actualizar</button>
      </header>

      <div className="pendientes-tarjetas">
        {tarjetas.map((t) => (
          <button key={t.id} className={`pendientes-tarjeta ${t.id}${filtro === t.id ? " on" : ""}`}
            onClick={() => setFiltro(filtro === t.id ? "todo" : t.id)}>
            <i><t.Icono size={17} /></i>
            <strong>{t.valor}</strong>
            <span>{t.texto}</span>
          </button>
        ))}
        {resumen.por_revisar > 0 && (
          <div className="pendientes-tarjeta revisar">
            <i><Inbox size={17} /></i>
            <strong>{resumen.por_revisar}</strong>
            <span>Esperan tu revisión</span>
          </div>
        )}
      </div>

      <div className="pendientes-filtros">
        {FILTROS.map(([id, etiqueta]) => (
          <button key={id} className={filtro === id ? "on" : ""} onClick={() => setFiltro(id)}>{etiqueta}</button>
        ))}
      </div>

      <div className="pendientes-lista">
        {visibles.map((s) => {
          const e = ESTADOS[s.estado] || ESTADOS.pendiente;
          const vencida = s.estado === "pendiente" && s.dias_restantes < 0;
          return (
            <article key={s.id} className={vencida ? "vencida" : ""}>
              <span className={`pendientes-estado ${e.clase}`}><e.Icono size={12} /> {e.etiqueta}</span>
              <div className="pendientes-datos">
                <b>{s.name}</b>
                <small>{s.contract_name || s.contract_number} · {s.section}</small>
                {s.observacion && <em>Observación: {s.observacion}</em>}
              </div>
              <span className={`pendientes-plazo${vencida ? " roja" : ""}`}>{vencimiento(s)}</span>
              <a className="pendientes-cargar" href={`/gestion-contractual/contrato/${s.contract_id}/solicitudes`}>
                <Upload size={14} /> {s.estado === "pendiente" ? "Cargar" : "Ver"}
              </a>
            </article>
          );
        })}
      </div>

      {!visibles.length && (
        <div className="pendientes-vacio">
          <CheckCircle2 size={26} />
          <h3>Nada por aquí</h3>
          <p>No tienes solicitudes en este estado.</p>
        </div>
      )}
    </section>
  );
}
