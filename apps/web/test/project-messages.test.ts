import { describe, expect, it } from "vitest";
import { NOTES_LIMIT, PROJECTS_LIMIT, projectErrorMessage, spaced } from "@/lib/project-messages";

describe("projectErrorMessage (tope 54000)", () => {
  it("al crear un proyecto nombra el tope de 1000 y no muestra el texto de la base", () => {
    const msg = projectErrorMessage({ code: "54000", message: "Llegaste al tope de 1000 proyectos" }, "project");
    expect(msg).toBe("Llegaste al tope de 1000 proyectos. No podemos crear otro por ahora.");
    expect(msg).not.toMatch(/projects_quota|pg_|errcode|54000/);
  });

  it("el tope de notas usa el texto de notas y el separador de miles", () => {
    expect(projectErrorMessage({ code: "54000" }, "note")).toBe(
      "Llegaste al tope de 10 000 notas en tus proyectos. No podemos guardar otra por ahora.",
    );
  });

  it("sin kind se trata como proyecto", () => {
    expect(projectErrorMessage({ code: "54000" })).toMatch(/tope de 1000 proyectos/);
  });

  it("los topes exportados coinciden con la migración (1000 proyectos, 10 000 notas)", () => {
    expect(PROJECTS_LIMIT).toBe(1000);
    expect(NOTES_LIMIT).toBe(10000);
  });
});

describe("projectErrorMessage (otros errores)", () => {
  it("un error ajeno al tope recibe el mensaje genérico de proyecto, sin texto de la base", () => {
    const msg = projectErrorMessage({ code: "42501", message: "new row violates row-level security policy for table projects" });
    expect(msg).toBe("No pudimos crear el proyecto. Revisa tu conexión e intenta de nuevo.");
    expect(msg).not.toMatch(/row-level|policy|projects/);
  });

  it("sin código o sin error, mensaje genérico", () => {
    expect(projectErrorMessage(undefined)).toMatch(/No pudimos crear el proyecto/);
    expect(projectErrorMessage(null, "note")).toMatch(/No pudimos guardar la nota/);
    expect(projectErrorMessage({}, "note")).toBe("No pudimos guardar la nota. Revisa tu conexión e intenta de nuevo.");
  });
});

describe("spaced", () => {
  it("agrupa de tres en tres con espacio", () => {
    expect(spaced(1000)).toBe("1 000");
    expect(spaced(10000)).toBe("10 000");
    expect(spaced(999)).toBe("999");
    expect(spaced(1234567)).toBe("1 234 567");
  });
});
