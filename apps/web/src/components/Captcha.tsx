"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
import { TURNSTILE_SITE_KEY, turnstile } from "@/lib/captcha";

/**
 * Widget de Cloudflare Turnstile (renderizado explícito). No muestra nada si no hay
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY. Debe ir dentro del <form>: Turnstile agrega allí el
 * campo oculto "cf-turnstile-response" con el token.
 */
export function Captcha() {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  const render = useCallback(() => {
    const api = turnstile();
    if (!api || !box.current || widget.current) return;
    widget.current = api.render(box.current, { sitekey: TURNSTILE_SITE_KEY, language: "es", theme: "light" });
  }, []);

  useEffect(() => {
    render(); // El script ya pudo cargarse en otra pantalla.
    return () => {
      if (widget.current) turnstile()?.remove(widget.current);
      widget.current = null;
    };
  }, [render]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div className="grid gap-1.5" role="group" aria-labelledby="captcha-label">
      <span id="captcha-label" className="font-bold">
        Verificación de seguridad
      </span>
      <div ref={box} />
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />
      <p className="text-sm text-tinta-suave">Confirma que eres una persona. Puedes completarla con el teclado.</p>
    </div>
  );
}
