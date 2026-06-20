import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  const me = await getCurrentUser();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  if (me) await logAudit({ actorUserId:me.id, action:"logout", entityType:"session", description:"Cierre de sesión" });
  return res;
}
