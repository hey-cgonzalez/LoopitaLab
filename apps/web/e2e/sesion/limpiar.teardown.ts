import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { test as teardown, expect } from "@playwright/test";
import { ACCOUNTS_FILE, adminClient, SESSION_ENABLED, SKIP_REASON, TEST_EMAIL_DOMAIN } from "./support.ts";

/*
 * Limpieza de las E2E con sesión: borra TODAS las cuentas del dominio de prueba (las de esta corrida, la del registro
 * y las que hayan quedado de una corrida cortada). Sus diseños, versiones y perfiles se van en cascada.
 * Borra también las sesiones guardadas en playwright/.auth/.
 */
teardown("borrar las cuentas de prueba", async () => {
  teardown.skip(!SESSION_ENABLED, SKIP_REASON);
  const admin = adminClient();
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    expect(error).toBeNull();
    const users = data.users ?? [];
    for (const u of users) if (u.email?.endsWith(`@${TEST_EMAIL_DOMAIN}`)) ids.push(u.id);
    if (users.length < 1000) break;
  }
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    expect(error, `borrar la cuenta ${id}`).toBeNull();
  }
  rmSync(dirname(ACCOUNTS_FILE), { recursive: true, force: true });
});
