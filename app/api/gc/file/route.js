import { contexto, ROL } from "@/lib/gc/rbac";
import { responderArchivo } from "@/lib/gc/files";

export const dynamic = "force-dynamic";

// Servidor único de archivos del módulo contractual.
// Cada origen declara de dónde sale el registro y a qué contrato pertenece,
// para poder validar el acceso siempre igual.
const ORIGENES = {
  documento: { tabla: "contract_files", propietario: "owner_user_id" },
  anexo: { tabla: "contract_activity_files", propietario: "user_id" },
  evidencia: { tabla: "contract_evidences", propietario: "user_id" },
  informe: { tabla: "contract_monthly_reports", propietario: "user_id" },
  entrega: { tabla: "contract_document_submissions", propietario: "user_id" },
};

export async function GET(req) {
  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo");
  const id = Number(url.searchParams.get("id"));
  const descargar = url.searchParams.get("download") === "1";

  const origen = ORIGENES[tipo];
  if (!origen || !id) return Response.json({ error: "Archivo no indicado" }, { status: 400 });

  // Primero se resuelve a qué contrato pertenece el archivo y después se
  // comprueba el acceso a ese contrato.
  const ctxBase = await contexto();
  if (ctxBase.error) return ctxBase.error;
  const [[registro]] = await ctxBase.pool.query(
    `SELECT id, contract_id, file_name, file_path, mime_type, ${origen.propietario} AS propietario FROM ${origen.tabla} WHERE id=?`,
    [id]
  );
  if (!registro) return Response.json({ error: "Archivo no encontrado" }, { status: 404 });

  const ctx = await contexto(registro.contract_id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;

  // El trabajador solo accede a lo suyo y a los documentos generales.
  if (ctx.rol === ROL.TRABAJADOR) {
    const propio = Number(registro.propietario) === Number(ctx.me.id);
    const general = tipo === "documento" && !registro.propietario;
    if (!propio && !general) return Response.json({ error: "No tienes acceso a este archivo" }, { status: 403 });
  }

  return responderArchivo(registro, { descargar });
}
