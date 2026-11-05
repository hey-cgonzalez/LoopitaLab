import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isSameSite, jsonError, jsonOk } from "@/app/api/_lib/request";

const req = (headers: Record<string, string> = {}) => new NextRequest("http://localhost:3000/api/x", { headers });

describe("isSameSite", () => {
  it("Sec-Fetch-Site same-origin: sí", () => {
    expect(isSameSite(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it.each(["same-site", "cross-site", "none", "SAME-ORIGIN", ""])("Sec-Fetch-Site %j: no (sin navegación)", (v) => {
    // "" se trata como ausente y cae al Origin, que no viene: tampoco pasa.
    expect(isSameSite(req({ "sec-fetch-site": v }))).toBe(false);
  });

  it("none solo vale como navegación (enlace o barra de direcciones)", () => {
    expect(isSameSite(req({ "sec-fetch-site": "none" }), { allowNavigation: true })).toBe(true);
    expect(isSameSite(req({ "sec-fetch-site": "cross-site" }), { allowNavigation: true })).toBe(false);
    expect(isSameSite(req({ "sec-fetch-site": "same-site" }), { allowNavigation: true })).toBe(false);
  });

  it("Sec-Fetch-Site manda sobre Origin", () => {
    expect(isSameSite(req({ "sec-fetch-site": "cross-site", origin: "http://localhost:3000" }))).toBe(false);
  });

  it("sin Sec-Fetch-Site se compara el Origin exacto", () => {
    expect(isSameSite(req({ origin: "http://localhost:3000" }))).toBe(true);
    expect(isSameSite(req({ origin: "http://localhost:3001" }))).toBe(false);
    expect(isSameSite(req({ origin: "https://localhost:3000" }))).toBe(false);
    expect(isSameSite(req({ origin: "http://localhost:3000.evil.test" }))).toBe(false);
    expect(isSameSite(req({ origin: "null" }))).toBe(false);
  });

  it("sin Sec-Fetch-Site ni Origin: solo si es navegación", () => {
    expect(isSameSite(req())).toBe(false);
    expect(isSameSite(req(), { allowNavigation: true })).toBe(true);
  });
});

describe("respuestas JSON", () => {
  it("jsonError lleva el código, el estado y no se guarda en caché", async () => {
    const r = jsonError(429, "daily_limit", { "Retry-After": "3600" });
    expect(r.status).toBe(429);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("retry-after")).toBe("3600");
    expect(await r.json()).toEqual({ error: "daily_limit" });
  });

  it("jsonOk", async () => {
    const r = jsonOk({ id: 1 }, 201);
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ id: 1 });
  });
});
