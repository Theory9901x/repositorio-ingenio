import { contexto } from "@/lib/gc/rbac";
import { generarActaPdf, generarActaWord } from "@/lib/gc/actaReunion";

export const dynamic = "force-dynamic";

// Acta de reunión y lista de asistencia como archivo descargable, en PDF o en
// Word, generados con lo que el sistema tiene registrado de la reunión.
export async function GET(req, { params }) {
  const ctx = await contexto(params.id, "CONTRACT_READ");
  if (ctx.error) return ctx.error;
  const { pool, me, contractId } = ctx;

  const q = new URL(req.url).searchParams;
  const meetingId = Number(q.get("meetingId"));
  const tipo = q.get("tipo") === "asistencia" ? "asistencia" : "acta";
  const formato = q.get("formato") === "word" ? "word" : "pdf";
  if (!meetingId) return Response.json({ error: "Reunión no indicada" }, { status: 400 });

  const [[reunion]] = await pool.query(
    `SELECT m.id, m.title, m.description, m.location,
            DATE_FORMAT(m.meeting_date,'%Y-%m-%d') meeting_date,
            u.full_name AS created_by_name
       FROM contract_meetings m LEFT JOIN users u ON u.id=m.created_by
      WHERE m.id=? AND m.contract_id=?`,
    [meetingId, contractId]
  );
  if (!reunion) return Response.json({ error: "La reunión no existe" }, { status: 404 });

  const [[contrato]] = await pool.query(
    `SELECT c.title, c.code, c.entity_name, u.full_name AS responsible_name, e.name AS company_name
       FROM contract_routes c
       LEFT JOIN users u ON u.id=c.internal_responsible_id
       LEFT JOIN contract_companies e ON e.id=c.company_id
      WHERE c.id=?`,
    [contractId]
  );

  const [participantes] = await pool.query(
    `SELECT u.full_name, u.cargo, cu.role_in_contract
       FROM contract_users cu JOIN users u ON u.id=cu.user_id
      WHERE cu.contract_id=? AND (cu.status IS NULL OR cu.status='activo')
      ORDER BY cu.role_in_contract='supervisor' DESC, u.full_name`,
    [contractId]
  );

  const datos = {
    tipo, contrato, reunion, participantes,
    generadoPor: me.full_name,
    generadoEn: new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" }),
  };

  const base = `${tipo === "acta" ? "Acta" : "Asistencia"}-${reunion.meeting_date}-${(reunion.title || "reunion").replace(/[^\wáéíóúñÁÉÍÓÚÑ -]+/g, "").trim().slice(0, 50)}`;

  try {
    const esWord = formato === "word";
    const buffer = esWord ? generarActaWord(datos) : generarActaPdf(datos);
    const nombre = `${base}.${esWord ? "doc" : "pdf"}`;
    const ascii = nombre.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    return new Response(buffer, {
      headers: {
        "Content-Type": esWord ? "application/msword" : "application/pdf",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json({ error: "No se pudo generar el documento: " + e.message }, { status: 500 });
  }
}
