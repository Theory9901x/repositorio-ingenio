import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT id, sigla, name, tier, sort_order FROM processes ORDER BY tier, sort_order"
  );
  return Response.json(rows);
}
