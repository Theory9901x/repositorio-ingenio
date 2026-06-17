import crypto from "crypto";
import { cookies } from "next/headers";

const secret = () => process.env.AUTH_SECRET || "insecure-dev-secret-change-me";
export const COOKIE = "gi_session";

export function sign() {
  const data = "admin." + Date.now();
  const h = crypto.createHmac("sha256", secret()).update(data).digest("hex");
  return data + "." + h;
}

export function verify(token) {
  if (!token) return false;
  const p = token.split(".");
  if (p.length !== 3) return false;
  const data = p[0] + "." + p[1];
  const h = crypto.createHmac("sha256", secret()).update(data).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(h), Buffer.from(p[2]))) return false;
  } catch {
    return false;
  }
  const ts = parseInt(p[1], 10);
  if (!ts || Date.now() - ts > 7 * 24 * 3600 * 1000) return false; // 7 días
  return true;
}

export function isAuthed() {
  const c = cookies().get(COOKIE)?.value;
  return verify(c);
}
