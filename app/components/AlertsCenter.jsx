"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, FileText, MessageSquare, X } from "lucide-react";

// Un icono por origen: se distingue de un vistazo el foro de una solicitud.
const ICONOS = { forum: MessageSquare, document_request: FileText, submission: FileText, activity: AlertTriangle };

export default function AlertsCenter() {
  const [items, setItems] = useState([]);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/alerts", { cache: "no-store" });
    const d = await r.json().catch(() => null);
    setItems(Array.isArray(d) ? d : []);
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 45000);
    // Al volver a la pestaña se refresca sin esperar al siguiente ciclo.
    const alVolver = () => { if (!document.hidden) cargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, [cargar]);

  const sinLeer = items.filter((x) => x.status === "unread").length;

  async function abrir(a) {
    if (a.status === "unread") {
      await fetch(`/api/alerts/${a.id}/read`, { method: "PUT" });
      setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: "read" } : x)));
    }
    // El aviso lleva al sitio donde se resuelve, no solo informa.
    if (a.link) window.location.href = a.link;
  }

  async function marcarTodas() {
    await fetch("/api/alerts/read-all", { method: "PUT" });
    cargar();
  }

  return (
    <div className="alerts-center">
      <button className="alerts-trigger" onClick={() => setAbierto(!abierto)} aria-label="Notificaciones">
        <Bell size={17} />{sinLeer > 0 && <b>{sinLeer}</b>}
      </button>
      {abierto && (
        <aside className="alerts-drawer">
          <header>
            <div><span>Notificaciones</span><b>{sinLeer} sin leer</b></div>
            <button onClick={() => setAbierto(false)}><X size={17} /></button>
          </header>
          {sinLeer > 0 && (
            <button className="read-all" onClick={marcarTodas}><CheckCheck size={15} /> Marcar todas como leídas</button>
          )}
          <div>
            {items.map((a) => {
              const Icono = ICONOS[a.related_type] || (a.severity === "success" ? CheckCircle2 : AlertTriangle);
              return (
                <article className={`${a.severity} ${a.status}${a.link ? " con-enlace" : ""}`} key={a.id} onClick={() => abrir(a)}>
                  <i><Icono size={16} /></i>
                  <p>
                    <b>{a.title}</b>
                    <span>{a.message}</span>
                    <small>{a.contract_name || "Sistema"} · {a.created_at}</small>
                  </p>
                </article>
              );
            })}
          </div>
          {!items.length && <p className="alerts-empty">No tienes notificaciones.</p>}
        </aside>
      )}
    </div>
  );
}
