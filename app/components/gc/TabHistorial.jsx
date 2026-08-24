"use client";

import { useEffect, useState } from "react";
import { CalendarClock, History } from "lucide-react";
import { api } from "./api";
import { BotonExportar, Cargando, Vacio, fmtFechaHora } from "./ui";

export default function TabHistorial({ contratoId, detalle }) {
  const [datos, setDatos] = useState(null);
  const [vista, setVista] = useState("eventos");

  useEffect(() => {
    let vigente = true;
    api(`/api/gc/contracts/${contratoId}/history`)
      .then((d) => vigente && setDatos(d))
      .catch(() => vigente && setDatos({ eventos: [], auditoria: [] }));
    return () => { vigente = false; };
  }, [contratoId]);

  if (!datos) return <section className="gc-card"><Cargando filas={6} /></section>;

  const puedeAuditar = detalle.rol !== "TRABAJADOR";
  const lista = vista === "eventos" ? datos.eventos : datos.auditoria;

  return (
    <section className="gc-card">
      <header className="gc-card-title">
        <h3>{detalle.rol === "TRABAJADOR" ? "Mi actividad en el contrato" : "Historial del contrato"}</h3>
        <BotonExportar contratoId={contratoId} seccion="historial" filtros={{ vista }} />
        {puedeAuditar && (
          <div className="gc-tabs" style={{ padding: 3, boxShadow: "none", background: "rgba(123,92,250,.07)" }}>
            <button className={vista === "eventos" ? "on" : ""} onClick={() => setVista("eventos")} style={{ padding: "6px 12px", fontSize: 11.5 }}>Eventos</button>
            <button className={vista === "auditoria" ? "on" : ""} onClick={() => setVista("auditoria")} style={{ padding: "6px 12px", fontSize: 11.5 }}>Auditoría</button>
          </div>
        )}
      </header>

      {lista.length ? (
        <div className="gc-timeline">
          {lista.map((e) => (
            <div className="gc-tl-item" key={`${vista}-${e.id}`}>
              <span className="gc-tl-dot"><i /></span>
              <div className="gc-tl-body">
                <b>{e.description || e.action}</b>
                <span>
                  {e.actor_name || "Sistema"}
                  {e.actor_cargo ? ` · ${e.actor_cargo}` : ""}
                  {" · "}{fmtFechaHora(e.created_at)}
                  {vista === "auditoria" && e.entity_type ? ` · ${e.entity_type}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Vacio icono={vista === "eventos" ? CalendarClock : History}
          titulo={vista === "eventos" ? "Todavía no hay movimientos" : "Sin registros de auditoría"}
          texto="Las acciones sobre el contrato quedarán registradas aquí." />
      )}
    </section>
  );
}
