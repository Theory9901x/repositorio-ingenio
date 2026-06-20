import { getCurrentUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { ensureFeatureSchema } from "@/lib/featureSchema";
import { ensureAdminSchema, addAdminEvent } from "@/lib/adminSchema";
export const dynamic="force-dynamic";

export async function GET(){
  const me=await getCurrentUser();if(!me)return Response.json({error:"No autorizado"},{status:401});
  const p=getPool();await ensureFeatureSchema(p);await ensureAdminSchema(p);
  const sql=me.isAdmin?`SELECT u.id,u.full_name,u.email,u.cargo,u.role,u.is_active,up.bio,up.phone,
    (up.photo_data IS NOT NULL) has_photo,GROUP_CONCAT(DISTINCT cr.title SEPARATOR ' · ') contracts
    FROM users u LEFT JOIN user_profiles up ON up.user_id=u.id LEFT JOIN contract_members cm ON cm.user_id=u.id
    LEFT JOIN contract_routes cr ON cr.id=cm.contract_id GROUP BY u.id ORDER BY u.is_active DESC,u.full_name`:
    `SELECT DISTINCT u.id,u.full_name,u.cargo,up.bio,(up.photo_data IS NOT NULL) has_photo FROM contract_members mine
    JOIN contract_members cm ON cm.contract_id=mine.contract_id JOIN users u ON u.id=cm.user_id
    LEFT JOIN user_profiles up ON up.user_id=u.id WHERE mine.user_id=? AND u.is_active=1`;
  const[rows]=await p.query(sql,me.isAdmin?[]:[me.id]);return Response.json(rows);
}

export async function PUT(req){
  const me=await getCurrentUser();if(!me?.isAdmin)return Response.json({error:"No autorizado"},{status:403});
  const b=await req.json(),p=getPool();await ensureFeatureSchema(p);await ensureAdminSchema(p);
  if(b.action==="membership"){
    if(b.enabled)await p.query("INSERT IGNORE INTO contract_members(contract_id,user_id) VALUES(?,?)",[b.contractId,b.userId]);
    else await p.query("DELETE FROM contract_members WHERE contract_id=? AND user_id=?",[b.contractId,b.userId]);
    await addAdminEvent(p,me.id,"usuarios","membership",b.userId,`${b.enabled?"Asignó":"Retiró"} usuario del contrato`);
  }else if(b.action==="status"){
    if(Number(b.id)===Number(me.id)&&!b.is_active)return Response.json({error:"No puedes desactivar tu propia cuenta"},{status:400});
    await p.query("UPDATE users SET is_active=? WHERE id=?",[b.is_active?1:0,b.id]);
    await addAdminEvent(p,me.id,"usuarios",b.is_active?"activated":"deactivated",b.id,`Usuario ${b.is_active?"activado":"desactivado"}`);
  }else{
    await p.query("UPDATE users SET full_name=?,email=?,cargo=?,role=? WHERE id=?",[b.full_name,b.email,b.cargo,b.role||"usuario",b.id]);
    await addAdminEvent(p,me.id,"usuarios","updated",b.id,`Usuario actualizado: ${b.full_name}`);
  }
  return Response.json({ok:true});
}

export async function DELETE(req){
  const me=await getCurrentUser();if(!me?.isAdmin)return Response.json({error:"No autorizado"},{status:403});
  const id=Number(new URL(req.url).searchParams.get("id"));if(!id)return Response.json({error:"Usuario inválido"},{status:400});
  if(id===Number(me.id))return Response.json({error:"No puedes desactivar tu propia cuenta"},{status:400});
  const p=getPool();await ensureAdminSchema(p);await p.query("UPDATE users SET is_active=0 WHERE id=?",[id]);
  await addAdminEvent(p,me.id,"usuarios","deactivated",id,"Usuario desactivado por administración");
  return Response.json({ok:true});
}
