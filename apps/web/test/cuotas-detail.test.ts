import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { mapDbError } = await import("@/lib/projects/messages");
const { dbErrorCode } = await import("@/lib/designs/messages");

describe("mapDbError en 54000: primero el detail estable", () => {
  it("projects, versions_total y versions_per_pattern, aunque el mensaje diga otra cosa", () => {
    expect(mapDbError({ code: "54000", details: "projects", message: "x 5000" })).toMatchObject({ code: "QUOTA" });
    expect(mapDbError({ code: "54000", details: "versions_total", message: "x 200" })).toMatchObject({ code: "VERSIONS_QUOTA" });
    expect(mapDbError({ code: "54000", detail: "versions_per_pattern", message: "x 5000" })).toMatchObject({ code: "MAX_VERSIONS" });
  });
  it("respaldo transitorio por el texto cuando no hay detail", () => {
    expect(mapDbError({ code: "54000", message: "Llegaste al máximo de 5000 versiones guardadas" })).toMatchObject({ code: "VERSIONS_QUOTA" });
    expect(mapDbError({ code: "54000", message: "máximo de 200 versiones" })).toMatchObject({ code: "MAX_VERSIONS" });
    expect(mapDbError({ code: "54000", message: "tope de 1000 proyectos" })).toMatchObject({ code: "QUOTA" });
    expect(mapDbError({ code: "54000" })).toMatchObject({ code: "DATABASE" });
  });
});

describe("dbErrorCode en 54000: primero el detail estable", () => {
  it("patterns es QUOTA y las versiones MAX_VERSIONS, sin importar op", () => {
    expect(dbErrorCode({ code: "54000", details: "patterns" }, "other")).toBe("QUOTA");
    expect(dbErrorCode({ code: "54000", details: "versions_per_pattern" }, "create")).toBe("MAX_VERSIONS");
    expect(dbErrorCode({ code: "54000", detail: "versions_total" }, "create")).toBe("MAX_VERSIONS");
  });
  it("sin detail, por op (transitorio)", () => {
    expect(dbErrorCode({ code: "54000" }, "create")).toBe("QUOTA");
    expect(dbErrorCode({ code: "54000" })).toBe("MAX_VERSIONS");
  });
});
