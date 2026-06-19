import crypto from "crypto";
import { cookies } from "next/headers";
import { getPool } from "./db";

const secret = () => process.env.AUTH_SECRET || "insecure-dev-secret-change-me";
export const COOKIE = "gi_session";

export function signUserId(userId) {
  const data = `${userId}.${Date.now()}`;
  const h = crypto.createHmac("sha256", secret()).update(data).digest("hex");
  return `${data}.${h}`;
}

// Returns the userId (number) if token is valid and not expired, otherwise false.
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
  if (!ts || Date.now() - ts > 7 * 24 * 3600 * 1000) return false;
  const userId = parseInt(p[0], 10);
  if (!userId) return false;
  return userId;
}

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// Returns the full user object with isAdmin flag, or null if not authenticated.
export async function getCurrentUser() {
  const c = cookies().get(COOKIE)?.value;
  const userId = verify(c);
  if (!userId) return null;
  const pool = getPool();
  const [[user]] = await pool.query(
    "SELECT id, full_name, email, cargo, role FROM users WHERE id=?",
    [userId]
  );
  if (!user) return null;
  let hasPhoto = false;
  try {
    const [[profile]] = await pool.query("SELECT (photo_data IS NOT NULL) AS has_photo FROM user_profiles WHERE user_id=?", [userId]);
    hasPhoto = !!profile?.has_photo;
  } catch {}
  const isAdmin =
    user.role === "admin" || adminEmails().includes(user.email.toLowerCase());
  return { ...user, isAdmin, hasPhoto };
}
