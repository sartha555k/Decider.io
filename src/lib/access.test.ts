import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAccess, accessDenial } from "./access";
import { GET, POST } from "../app/api/workspace/route";
const username = "test-operator",
  password = "a-private-test-password-32-chars";
const header = (user: string, pass: string) =>
  "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TRACKER_AUTH_USERNAME", username);
  vi.stubEnv("TRACKER_AUTH_PASSWORD", password);
});
afterEach(() => vi.unstubAllEnvs());
describe("private deployment access", () => {
  it("allows only the configured credentials", () => {
    expect(checkAccess(header(username, password))).toBe("allowed");
    expect(checkAccess(header(username, "wrong-password"))).toBe(
      "unauthorized",
    );
    expect(checkAccess(header("someone-else", password))).toBe("unauthorized");
    expect(checkAccess(null)).toBe("unauthorized");
  });
  it("fails closed when production credentials are missing or weak", () => {
    vi.stubEnv("TRACKER_AUTH_PASSWORD", "");
    expect(checkAccess(null)).toBe("unconfigured");
    expect(accessDenial(null)?.status).toBe(503);
    vi.stubEnv("TRACKER_AUTH_PASSWORD", "weak");
    expect(checkAccess(header(username, "weak"))).toBe("unconfigured");
  });
  it("permits an unconfigured local development demo, but not a partial configuration", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TRACKER_AUTH_USERNAME", "");
    vi.stubEnv("TRACKER_AUTH_PASSWORD", "");
    expect(checkAccess(null)).toBe("allowed");
    vi.stubEnv("TRACKER_AUTH_USERNAME", username);
    expect(checkAccess(null)).toBe("unconfigured");
  });
  it("rejects malformed and oversized headers with a challenge and no cached response", () => {
    for (const value of [
      "Bearer abc",
      "Basic !!!",
      "Basic " + "a".repeat(3000),
    ])
      expect(checkAccess(value)).toBe("unauthorized");
    const denied = accessDenial(null)!;
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain("Basic");
    expect(denied.headers.get("cache-control")).toBe("no-store");
  });
  it("supports colons and unicode in the private password", () => {
    const pass = "a-long-password:with-üñicode";
    vi.stubEnv("TRACKER_AUTH_PASSWORD", pass);
    expect(checkAccess(header(username, pass))).toBe("allowed");
  });
  it("protects workspace reads and writes independently of the proxy", async () => {
    const read = await GET(new Request("http://localhost/api/workspace"));
    const write = await POST(
      new Request("http://localhost/api/workspace", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });
  it("accepts the configured HTTPS origin behind a proxy and rejects other origins", async () => {
    vi.stubEnv("TRACKER_APP_ORIGIN", "https://tracker.example.com");
    for (const [origin, expected] of [
      ["https://tracker.example.com", 400],
      ["https://other.example.com", 403],
    ] as const) {
      const response = await POST(
        new Request("http://localhost/api/workspace", {
          method: "POST",
          headers: { authorization: header(username, password), origin },
          body: "{}",
        }),
      );
      // The valid origin reaches input validation; no database or provider call is needed.
      expect(response.status).toBe(expected);
    }
  });
});
