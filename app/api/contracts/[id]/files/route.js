import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { ensureFeatureSchema } from "@/lib/featureSchema";
import { ensureContractSchema, addContractEvent } from "@/lib/contracts";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads";
const CONTRACT_DIR = path.join(UPLOAD_DIR, "contracts");

export async function GET(_req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const contractId = Number(params.id);
  const pool = getPool();
  await ensureContractSchema(pool);
  await ensureFeatureSchema(pool);
  const [[access]]=await pool.query("SELECT 1 ok FROM contract_routes c WHERE c.id=? AND (? OR EXISTS(SELECT 1 FROM contract_members m WHERE m.contract_id=c.id AND m.user_id=?))",[contractId,me.isAdmin?1:0,me.id]);
  if(!access)return Response.json({error:"No perteneces a este contrato"},{status:403});
  const [rows] = await pool.query(
    `SELECT cf.id, cf.contract_id, cf.uploaded_by, cf.section, cf.title, cf.description,
            cf.file_name, cf.file_path, cf.mime_type, cf.size_bytes, cf.visibility, cf.owner_user_id,
            DATE_FORMAT(cf.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,
            u.full_name AS uploaded_by_name
     FROM contract_files cf
     LEFT JOIN users u ON u.id = cf.uploaded_by
     WHERE cf.contract_id=? AND (? OR cf.visibility='general' OR cf.owner_user_id=?) ORDER BY cf.created_at DESC`,
    [contractId,me.isAdmin?1:0,me.id]
  );
  return Response.json(rows);
}

export async function POST(req, { params }) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "No autorizado" }, { status: 401 });
  const contractId = Number(params.id);
  const pool = getPool();
  await ensureFeatureSchema(pool);
  await ensureContractSchema(pool);
  const [[membership]]=await pool.query("SELECT 1 ok FROM contract_routes c WHERE c.id=? AND (? OR EXISTS(SELECT 1 FROM contract_members m WHERE m.contract_id=c.id AND m.user_id=?))",[contractId,me.isAdmin?1:0,me.id]);
  if(!membership)return Response.json({error:"No perteneces a este contrato"},{status:403});
  const [[contract]] = await pool.query("SELECT id FROM contract_routes WHERE id=?", [contractId]);
  if (!contract) return Response.json({ error: "Contrato no encontrado" }, { status: 404 });

  const fd = await req.formData();
  const section = (fd.get("section") || "soporte").toString();
  const title = (fd.get("title") || "").toString().trim();
  const description = (fd.get("description") || "").toString().trim() || null;
  const visibility = (fd.get("visibility") || "general").toString();
  const ownerUserId = visibility === "user_evidence" ? me.id : null;
  const file = fd.get("file");
  if (!file || typeof file !== "object" || file.size <= 0) return Response.json({ error: "Archivo requerido" }, { status: 400 });

  const ext = path.extname(file.name) || "";
  const stored = `${contractId}-${me.id}-${crypto.randomUUID()}${ext}`;
  await fs.mkdir(CONTRACT_DIR, { recursive: true });
  await fs.writeFile(path.join(CONTRACT_DIR, stored), Buffer.from(await file.arrayBuffer()));

  const [result] = await pool.query(
    "INSERT INTO contract_files (contract_id,uploaded_by,section,title,description,file_name,file_path,mime_type,size_bytes,visibility,owner_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [contractId, me.id, section, title || file.name, description, file.name, "contracts/" + stored, file.type || "application/octet-stream", file.size, visibility, ownerUserId]
  );
  await addContractEvent(pool,contractId,me.id,"file_uploaded",`Archivo cargado: ${title || file.name}`);
  return Response.json({ ok: true, id: result.insertId });
}
