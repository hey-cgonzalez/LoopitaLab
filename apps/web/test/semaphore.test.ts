import { describe, expect, it } from "vitest";
import { Semaphore } from "@/app/api/_lib/semaphore";

describe("Semaphore", () => {
  it("deja pasar hasta max a la vez y encola el resto", async () => {
    const s = new Semaphore(2, 1);
    const a = await s.acquire();
    const b = await s.acquire();
    expect(s.running).toBe(2);
    let cGot = false;
    const c = s.acquire().then((r) => {
      cGot = true;
      return r;
    });
    await Promise.resolve();
    expect(cGot).toBe(false);
    expect(s.waiting).toBe(1);
    // Con la cola llena, el siguiente se rechaza enseguida.
    expect(await s.acquire()).toBeNull();
    a!();
    const cr = await c;
    expect(cGot).toBe(true);
    expect(s.running).toBe(2);
    b!();
    cr!();
    expect(s.running).toBe(0);
  });

  it("soltar dos veces no libera dos lugares", async () => {
    const s = new Semaphore(1, 0);
    const a = await s.acquire();
    a!();
    a!();
    expect(s.running).toBe(0);
    const b = await s.acquire();
    expect(s.running).toBe(1);
    expect(await s.acquire()).toBeNull();
    b!();
  });
});
