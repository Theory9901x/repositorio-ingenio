import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT id, sigla, name, sort_order FROM doc_types ORDER BY sort_order"
  );
  return Response.json(rows);
}
