import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFeatureSchema } from "@/lib/featureSchema";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getPool();
  await ensureFeatureSchema(pool);
  const [rows] = await pool.query(
    `SELECT p.id,p.sigla,p.name,p.tier,p.sort_order,pc.objective,pc.owner_name AS owner,
      pc.scope,pc.subprocesses,COALESCE(pc.is_published,0) AS is_published
     FROM processes p LEFT JOIN process_contents pc ON pc.process_id=p.id ORDER BY p.tier,p.sort_order`
  );
  return Response.json(rows.map(r=>({...r,subprocesses:r.subprocesses?JSON.parse(r.subprocesses):[]})));
}

export async function POST(req) {
  const me=await getCurrentUser(); if(!me?.isAdmin) return Response.json({error:"No autorizado"},{status:401});
  const b=await req.json().catch(()=>({})); if(!b.name?.trim()||!b.sigla?.trim()) return Response.json({error:"Nombre y sigla requeridos"},{status:400});
  const pool=getPool(); await ensureFeatureSchema(pool);
  const [r]=await pool.query("INSERT INTO processes(sigla,name,tier,sort_order) VALUES(?,?,?,?)",[b.sigla.trim(),b.name.trim(),b.tier||"apoyo",Number(b.sort_order)||0]);
  await saveContent(pool,r.insertId,b,me.id); return Response.json({ok:true,id:r.insertId});
}
async function saveContent(pool,id,b,userId){await pool.query(`INSERT INTO process_contents(process_id,objective,owner_name,scope,subprocesses,is_published,updated_by) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE objective=VALUES(objective),owner_name=VALUES(owner_name),scope=VALUES(scope),subprocesses=VALUES(subprocesses),is_published=VALUES(is_published),updated_by=VALUES(updated_by)`,[id,b.objective||null,b.owner||null,b.scope||null,JSON.stringify(b.subprocesses||[]),b.is_published?1:0,userId]);}
export async function PUT(req){const me=await getCurrentUser();if(!me?.isAdmin)return Response.json({error:"No autorizado"},{status:401});const b=await req.json().catch(()=>({}));const id=Number(b.id);const pool=getPool();await ensureFeatureSchema(pool);await pool.query("UPDATE processes SET sigla=?,name=?,tier=?,sort_order=? WHERE id=?",[b.sigla,b.name,b.tier,Number(b.sort_order)||0,id]);await saveContent(pool,id,b,me.id);return Response.json({ok:true});}
export async function DELETE(req){const me=await getCurrentUser();if(!me?.isAdmin)return Response.json({error:"No autorizado"},{status:401});const id=Number(new URL(req.url).searchParams.get("id"));const pool=getPool();try{await pool.query("DELETE FROM processes WHERE id=?",[id]);return Response.json({ok:true});}catch{return Response.json({error:"No se puede eliminar: el proceso tiene documentos asociados"},{status:409});}}
