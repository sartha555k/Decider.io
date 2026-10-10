import { createHash, timingSafeEqual } from "node:crypto";

export function accessConfiguration() {
  const username = process.env.TRACKER_AUTH_USERNAME;
  const password = process.env.TRACKER_AUTH_PASSWORD;
  const configured = Boolean(
    username &&
    /^[A-Za-z0-9._-]{1,80}$/.test(username) &&
    password &&
    password.length >= 16,
  );
  return {
    configured,
    required:
      process.env.NODE_ENV === "production" || Boolean(username || password),
    username,
    password,
  };
}
export function checkAccess(
  authorization: string | null,
): "allowed" | "unauthorized" | "unconfigured" {
  const config = accessConfiguration();
  if (!config.required) return "allowed";
  if (!config.configured) return "unconfigured";
  if (
    !authorization ||
    authorization.length > 2048 ||
    !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(authorization)
  )
    return "unauthorized";
  const provided = Buffer.from(authorization.slice(6), "base64").toString(
    "utf8",
  );
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(
    digest(provided),
    digest(`${config.username}:${config.password}`),
  )
    ? "allowed"
    : "unauthorized";
}

export function accessDenial(authorization: string | null): Response | null {
  const access = checkAccess(authorization);
  if (access === "allowed") return null;
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (access === "unauthorized")
    headers["WWW-Authenticate"] =
      'Basic realm="Buyer Correction Tracker", charset="UTF-8"';
  return Response.json(
    {
      error:
        access === "unconfigured"
          ? "Private deployment access is not configured."
          : "Authentication required.",
    },
    { status: access === "unconfigured" ? 503 : 401, headers },
  );
}
