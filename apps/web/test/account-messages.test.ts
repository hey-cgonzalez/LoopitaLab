import { describe, expect, it } from "vitest";
import { deleteAccountMessage, exportMessage, reauthErrorMessage, reauthIntentMessage } from "@/lib/account-messages";

describe("reauthErrorMessage", () => {
  it.each([
    ["invalid_credentials", /contraseña no es correcta/],
    ["captcha_failed", /robot/],
    ["over_request_rate_limit", /muchos intentos/],
    ["email_not_confirmed", /confirmar tu correo/],
    [undefined, /No pudimos verificar tu contraseña/],
    ["otro", /No pudimos verificar tu contraseña/],
  ])("%s", (code, re) => expect(reauthErrorMessage(code)).toMatch(re));
});

describe("deleteAccountMessage", () => {
  it.each([
    [400, undefined, /ELIMINAR/],
    [401, undefined, /sesión expiró/],
    [403, "reauth_required", /Vuelve a confirmar/],
    [403, "cross_site", /bloqueada por seguridad/],
    [403, undefined, /permiso/],
    [413, undefined, /demasiado grande/],
    [429, undefined, /muchos intentos/],
    [500, "delete_failed", /No pudimos eliminar tu cuenta/],
    [502, undefined, /No pudimos eliminar tu cuenta/],
  ])("%i %s", (status, reason, re) => expect(deleteAccountMessage(status, reason)).toMatch(re));
});

describe("exportMessage", () => {
  it.each([
    [0, undefined, /se cortó/],
    [401, undefined, /sesión expiró/],
    [403, "cross_site", /bloqueada/],
    [409, "operation_in_progress", /Ya estamos preparando/],
    [429, "daily_limit", /máximo de 5 descargas/],
    [429, undefined, /muchos intentos/],
    [500, "export_failed", /No pudimos preparar tus datos/],
  ])("%i %s", (status, reason, re) => expect(exportMessage(status, reason)).toMatch(re));
});

describe("reauthIntentMessage", () => {
  it.each([
    [401, /sesión expiró/],
    [403, /bloqueada/],
    [429, /muchos intentos de confirmación/],
    [500, /No pudimos preparar la confirmación/],
    [0, /No pudimos preparar la confirmación/],
  ])("%i", (status, re) => expect(reauthIntentMessage(status)).toMatch(re));
});
