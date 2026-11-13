"use client";

import { useEffect, useRef, useState } from "react";

type Result = { context: "webgl2" | "webgl" | "none"; renderer: string; drawn: boolean };

const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
const FRAG = "precision mediump float; void main(){ gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }";

function probe(canvas: HTMLCanvasElement): Result {
  const opts = { preserveDrawingBuffer: true, antialias: false };
  let kind: Result["context"] = "webgl2";
  let gl = canvas.getContext("webgl2", opts) as WebGLRenderingContext | null;
  if (!gl) {
    kind = "webgl";
    gl = canvas.getContext("webgl", opts) as WebGLRenderingContext | null;
  }
  if (!gl) return { context: "none", renderer: "", drawn: false };
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";

  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  // Triángulo que cubre el centro del lienzo.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 0, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.finish();
  const px = new Uint8Array(4);
  gl.readPixels(canvas.width >> 1, canvas.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { context: kind, renderer, drawn: px[0] === 255 && px[1] === 0 && px[2] === 0 };
}

export function WebglProbe() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (ref.current) setResult(probe(ref.current));
  }, []);

  return (
    <div
      data-testid="webgl-probe"
      data-ready={result ? "true" : "false"}
      data-context={result?.context ?? ""}
      data-renderer={result?.renderer ?? ""}
      data-drawn={result ? String(result.drawn) : ""}
    >
      <canvas ref={ref} width={64} height={64} aria-label="Triángulo de prueba de WebGL" className="border border-tinta-suave" />
      <p className="mt-2 text-sm" aria-live="polite">
        {result ? `Contexto: ${result.context}. Renderer: ${result.renderer || "no informado"}.` : "Probando…"}
      </p>
    </div>
  );
}
