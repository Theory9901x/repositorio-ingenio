import fs from "fs/promises"; import path from "path"; import crypto from "crypto";
import { requireInternalAdmin, logInternalEvent } from "@/lib/internalDocs";
export const dynamic = "force-dynamic";
const ROOT = path.join(process.env.UPLOAD_DIR || "/var/lib/repositorio/uploads", "internal");
export async function GET(req) {
  const auth = await requireInternalAdmin(); if (auth.response) return auth.response;
  const url = new URL(req.url), folder = url.searchParams.get("folderId"), query = url.searchParams.get("q") || "", type = url.searchParams.get("type") || "", uploader = url.searchParams.get("uploadedBy") || "";
  const where = ["d.status<>'eliminado'"], values=[];
  if (folder === "root") where.push("d.folder_id IS NULL"); else if (folder) { where.push("d.folder_id=?"); values.push(Number(folder)); }
  if (query) { where.push("(d.title LIKE ? OR d.original_file_name LIKE ? OR d.tags LIKE ?)"); values.push(...Array(3).fill(`%${query}%`)); }
  if (type) { where.push("d.document_type=?"); values.push(type); } if (uploader) { where.push("d.uploaded_by=?"); values.push(Number(uploader)); }
  const [rows] = await auth.pool.query(`SELECT d.*,u.full_name AS uploaded_by_name,f.name AS folder_name,DATE_FORMAT(d.created_at,'%Y-%m-%d %H:%i:%s') created_at_formatted FROM internal_documents d LEFT JOIN users u ON u.id=d.uploaded_by LEFT JOIN internal_folders f ON f.id=d.folder_id WHERE ${where.join(" AND ")} ORDER BY d.created_at DESC`, values);
  return Response.json(rows);
}
export async function POST(req) {
  const auth = await requireInternalAdmin(); if (auth.response) return auth.response;
  const fd=await req.formData(), folderId=fd.get("folderId")?Number(fd.get("folderId")):null, files=fd.getAll("files").filter(f=>f&&typeof f==="object"&&f.size>0);
  if (!files.length) return Response.json({error:"Selecciona al menos un archivo"},{status:400});
  if(folderId){const [[f]]=await auth.pool.query("SELECT id FROM internal_folders WHERE id=?",[folderId]);if(!f)return Response.json({error:"Carpeta destino no encontrada"},{status:404});}
  await fs.mkdir(ROOT,{recursive:true}); const ids=[];
  for(const file of files){const stored=crypto.randomUUID()+path.extname(file.name);await fs.writeFile(path.join(ROOT,stored),Buffer.from(await file.arrayBuffer()));
    const title=files.length===1&&fd.get("title")?String(fd.get("title")):file.name;
    const [result]=await auth.pool.query(`INSERT INTO internal_documents(folder_id,title,description,original_file_name,stored_file_path,mime_type,size_bytes,document_type,tags,status,access_level,observations,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[folderId,title,fd.get("description")||null,file.name,"internal/"+stored,file.type||"application/octet-stream",file.size,fd.get("documentType")||"otro",fd.get("tags")||null,fd.get("status")||"vigente",fd.get("accessLevel")||"admin_only",fd.get("observations")||null,auth.user.id]);
    ids.push(result.insertId); await logInternalEvent(auth.pool,auth.user.id,/zip|archive/.test(file.type)||/\.zip$/i.test(file.name)?"zip_uploaded":"document_uploaded",`Documento cargado: ${file.name}`,folderId,result.insertId);}
  return Response.json({ok:true,ids});
}
