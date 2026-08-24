"use client";

import { use } from "react";
import GestionContractual from "../../components/gc/GestionContractual";

// Ruta comodín: la URL describe el nivel de navegación.
//   /gestion-contractual
//   /gestion-contractual/empresa/{empresaId}
//   /gestion-contractual/contrato/{contratoId}/{submodulo}
//   /gestion-contractual/contrato/{contratoId}/actividades/{userId}/{año}/{mes}
//   /gestion-contractual/contrato/{contratoId}/evidencias/{userId}
export default function PaginaGestionContractual({ params }) {
  const { ruta } = params;
  return <GestionContractual ruta={ruta || []} />;
}
