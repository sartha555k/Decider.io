import { openDatabase } from "../../../lib/database";
import { accessConfiguration } from "../../../lib/access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  const access = accessConfiguration();
  if (access.required && !access.configured)
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const db = openDatabase();
    try {
      db.prepare("SELECT 1").get();
    } finally {
      db.close();
    }
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
