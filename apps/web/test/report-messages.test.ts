import { describe, expect, it } from "vitest";
import { reportErrorMessage } from "@/lib/report-messages";

describe("reportErrorMessage", () => {
  it("duplicado", () => expect(reportErrorMessage("23505")).toBe("Ya denunciaste este patrón."));
  it("tope diario", () => expect(reportErrorMessage("54000")).toMatch(/tope de 20 denuncias en 24 horas/));
  it("no permitido", () => expect(reportErrorMessage("42501")).toBe("No es posible denunciar este patrón."));
  it("23503 ya no tiene mensaje propio", () => expect(reportErrorMessage("23503")).toMatch(/No pudimos enviar/));
  it("código desconocido o ausente", () => {
    expect(reportErrorMessage("XX000")).toMatch(/No pudimos enviar/);
    expect(reportErrorMessage(undefined)).toMatch(/No pudimos enviar/);
  });
});
