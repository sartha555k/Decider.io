import { NextResponse, type NextRequest } from "next/server";
import { accessDenial } from "./lib/access";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();
  return (
    accessDenial(request.headers.get("authorization")) || NextResponse.next()
  );
}
export const config = { matcher: "/:path*" };
