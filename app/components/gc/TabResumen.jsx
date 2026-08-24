"use client";

import { CalendarClock, ClipboardList, FileText, ShieldCheck, Users } from "lucide-react";
import { Anillo, Estado, fmtFecha } from "./ui";

// Resumen deliberadamente breve: información contractual, avance y poco más.
export default function TabResumen({ detalle, ir }) {
  const { contrato, avance, rol } = detalle;
  const esTrabajador = rol === "TRABAJADOR";

  const pendientes = [
    { id: "solicitudes", icono: ClipboardList, texto: "Documentos solicitados sin entregar", valor: Number(avance.solicitudes_pendientes || 0), tab: "solicitudes" },
    { id: "evidencias", icono: ShieldCheck, texto: "Evidencias sin validar", valor: Math.max(0, Number(avance.evidencias || 0) - Number(avance.evidencias_validadas || 0)), tab: "evidencias" },
    { id: "actividades", icono: CalendarClock, texto: "Actividades sin aprobar", valor: Math.max(0, Number(avance.actividades || 0) - Number(avance.actividades_aprobadas || 0)), tab: "actividades" },
  ].filter((p) => p.valor > 0).slice(0, 3);

  return (
    <div className="gc-grid c2">
      <section className="gc-card">
        <header className="gc-card-title"><h3>Información contractual</h3></header>
        <div style={{ display: "grid", gap: 13 }}>
          <Dato etiqueta="Objeto contractual" valor={contrato.object} largo />
          <Dato etiqueta="Descripción / alcance" valor={contrato.description} largo />
          <div className="gc-grid c2" style={{ gap: 13 }}>
            <Dato etiqueta="Empresa" valor={contrato.company_name || contrato.entity_name} />
            <Dato etiqueta="Código" valor={contrato.code} />
            <Dato etiqueta="Supervisor" valor={contrato.responsible_name} />
            <Dato etiqueta="Estado" valor={<Estado valor={contrato.status} />} />
            <Dato etiqueta="Inicio" valor={fmtFecha(contrato.start_date)} />
            <Dato etiqueta="Terminación" valor={fmtFecha(contrato.end_date)} />
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <section className="gc-card">
          <header className="gc-card-title"><h3>{esTrabajador ? "Mi avance" : "Avance del contrato"}</h3></header>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Anillo valor={Number(avance.actividades_aprobadas || 0)} total={Number(avance.actividades || 0)} size={84} />
            <div style={{ flex: 1, display: "grid", gap: 10 }}>
              <Linea icono={ClipboardList} etiqueta="Actividades aprobadas" valor={`${avance.actividades_aprobadas || 0} / ${avance.actividades || 0}`} />
              <Linea icono={ShieldCheck} etiqueta="Evidencias validadas" valor={`${avance.evidencias_validadas || 0} / ${avance.evidencias || 0}`} />
              <Linea icono={FileText} etiqueta="Documentos del contrato" valor={avance.documentos || 0} />
              {!esTrabajador && <Linea icono={Users} etiqueta="Participantes" valor={avance.participantes || 0} />}
            </div>
          </div>
        </section>

        <section className="gc-card">
          <header className="gc-card-title"><h3>Requiere atención</h3></header>
          {pendientes.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {pendientes.map((p) => {
                const I = p.icono;
                return (
                  <button className="gc-item" key={p.id} onClick={() => ir("contrato", contrato.id, p.tab)}>
                    <span className="ico" style={{ background: "rgba(224,147,12,.13)", color: "var(--gc-warn)" }}><I size={16} /></span>
                    <span className="txt"><b>{p.valor}</b><small>{p.texto}</small></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--gc-muted)", fontWeight: 700 }}>
              No hay pendientes registrados en este contrato.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, largo }) {
  return (
    <div>
      <span style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--gc-muted)", marginBottom: 4 }}>
        {etiqueta}
      </span>
      <div style={{ fontSize: largo ? 13 : 13.5, fontWeight: largo ? 500 : 800, lineHeight: largo ? 1.55 : 1.3, color: valor ? "var(--gc-ink)" : "var(--gc-muted)" }}>
        {valor || "No registrado"}
      </div>
    </div>
  );
}

function Linea({ icono: I, etiqueta, valor }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <I size={15} style={{ color: "var(--gc-violet)", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12.5, color: "var(--gc-soft)", fontWeight: 700 }}>{etiqueta}</span>
      <b style={{ fontSize: 13, fontWeight: 800 }}>{valor}</b>
    </div>
  );
}
