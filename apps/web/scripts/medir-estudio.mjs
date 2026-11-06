// Medición de `edit-to-paint` del estudio real (T10; CA-P1 a CA-P4, CA-P6, CA-P7). Sin dependencias (Node 24).
// Ver packages/stitch-render/README.md, "Medición en el estudio (T10) y equipo de referencia (CA-P6)".
//
// Uso:
//   node medir-estudio.mjs <puerto-devtools> <baseUrl> <dirSalida> [cpuRate=1] [etiqueta=x] [trace=0|1] [capturas=0|1]
//   node medir-estudio.mjs --revisar-trace <trace.json>
// Requiere el servidor con LOOPITA_DEV_PAGES=1 y un Chrome con --remote-debugging-port. `SCEN=plano,tubo` limita los escenarios.
// Escribe <dirSalida>/t10-<etiqueta>.json (resumen por forma), y con trace o capturas, trace-<etiqueta>.json y estudio-*.png.
import { readFileSync, writeFileSync } from "node:fs";

if (process.argv[2] === "--revisar-trace") {
  revisarTrace(process.argv[3]);
  process.exit(0);
}
const [port, base, outDir, cpuRate = "1", tag = "x", traceOn = "0", shots = "0"] = process.argv.slice(2);
const keepAlive = setInterval(() => {}, 1000);
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = list.find((t) => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const traceChunks = [];
let traceDone = null;
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === "Tracing.dataCollected") traceChunks.push(...m.params.value);
  else if (m.method === "Tracing.tracingComplete") traceDone?.();
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(method + " " + JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let seed = 20261106;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !extra.buttons ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1, ...extra });
const key = async (k, code, vk) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); };

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setCPUThrottlingRate", { rate: Number(cpuRate) });
// Sin foco ni visibilidad, Chrome detiene requestAnimationFrame y la medición se cuelga (ventana ocluida en macOS).
// Abrir Chrome con --disable-backgrounding-occluded-windows --disable-renderer-backgrounding.
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Page.bringToFront");

async function load(url) {
  await send("Page.navigate", { url });
  for (let k = 0; k < 120; k++) {
    await wait(500);
    const ok = await evaluate("!!(window.__loopitaPerf && document.querySelector('[data-testid=chart-canvas]') && document.querySelector('[data-testid=preview-canvas]'))").catch(() => false);
    if (ok) break;
  }
  await wait(1500);
}
async function editorGeom() {
  return evaluate(`(() => { const c = document.querySelector('[data-testid=chart-canvas]'); c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); const cols = +c.dataset.cols, rows = +c.dataset.rows, px = +c.dataset.cellPx; return { x: r.x, y: r.y, w: r.width, h: r.height, cols, rows, px, left: (r.width - cols * px) / 2, top: (r.height - rows * px) / 2 }; })()`);
}
const cellXY = (g, cx, cy) => ({ x: g.x + g.left + (cx + 0.5) * g.px, y: g.y + g.top + (g.rows - 1 - cy + 0.5) * g.px });
const summary = () => evaluate("window.__loopitaPerf.summary()");
const reset = () => evaluate("window.__loopitaPerf.reset()");

async function paintClicks(n) {
  const g = await editorGeom();
  await wait(300);
  for (let k = 0; k < n; k++) {
    // Elige otra lana con la tecla (no es una edición) y pinta una casilla al azar.
    await key(String((k % 4) + 1), `Digit${(k % 4) + 1}`, 49 + (k % 4));
    const p = cellXY(g, Math.floor(rnd() * g.cols), Math.floor(rnd() * g.rows));
    await mouse("mousePressed", p.x, p.y, { buttons: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0 });
    await wait(80 + Math.floor(rnd() * 600)); // pausas variadas: a veces dejan correr la validación diferida
  }
}
async function keyboardPaints(n) {
  for (let k = 0; k < n; k++) {
    await key(String(((k + 1) % 4) + 1), `Digit${((k + 1) % 4) + 1}`, 49 + ((k + 1) % 4));
    await key("ArrowRight", "ArrowRight", 39);
    await key("Enter", "Enter", 13);
    await wait(120 + Math.floor(rnd() * 400));
  }
}
async function stroke(steps) {
  const g = await editorGeom();
  await key("2", "Digit2", 50);
  await evaluate("window.__loopitaPerf.startFrames()");
  let cx = 0, cy = Math.floor(g.rows / 2);
  let p = cellXY(g, cx, cy);
  await mouse("mousePressed", p.x, p.y, { buttons: 1 });
  for (let k = 0; k < steps; k++) {
    cx = (cx + 1) % g.cols;
    if (cx === 0) cy = (cy + 1) % g.rows;
    if (k === Math.floor(steps / 2)) await key("3", "Digit3", 51); // no cambia la lana del trazo (tecla durante el trazo)
    p = cellXY(g, cx, cy);
    await mouse("mouseMoved", p.x, p.y, { buttons: 1 });
    await wait(16);
  }
  await mouse("mouseReleased", p.x, p.y, { buttons: 0 });
  const f = await evaluate("window.__loopitaPerf.stopFrames()");
  await wait(400);
  return f;
}
async function repeats(n, field) {
  const res = [];
  for (let k = 0; k < n; k++) {
    for (const lab of field) {
      await evaluate(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === '${lab}'); const i = document.getElementById(l.htmlFor); i.focus(); i.select(); return true; })()`);
      await send("Input.insertText", { text: k % 2 === 0 ? "5" : "10" });
    }
    await wait(250 + Math.floor(rnd() * 400));
  }
  return res;
}
async function previewGeom() {
  return evaluate(`(() => { const c = document.querySelector('[data-testid=preview-canvas]'); c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
}
async function zoomAndPan() {
  const c = await previewGeom();
  await wait(300);
  await evaluate("window.__loopitaPerf.startFrames()");
  for (let k = 0; k < 60; k++) { await mouse("mouseWheel", c.x, c.y, { deltaX: 0, deltaY: k < 30 ? -40 : 40, button: "none" }); await wait(16); }
  const zoom = await evaluate("window.__loopitaPerf.stopFrames()");
  await wait(300);
  for (let k = 0; k < 8; k++) { await mouse("mouseWheel", c.x, c.y, { deltaX: 0, deltaY: -120, button: "none" }); await wait(20); }
  await wait(400);
  await evaluate("window.__loopitaPerf.startFrames()");
  await mouse("mousePressed", c.x, c.y, { buttons: 1 });
  let x = c.x, y = c.y;
  for (let k = 0; k < 60; k++) { x += k < 30 ? 6 : -6; y += k < 30 ? 3 : -3; await mouse("mouseMoved", x, y, { buttons: 1 }); await wait(16); }
  await mouse("mouseReleased", x, y, { buttons: 0 });
  const pan = await evaluate("window.__loopitaPerf.stopFrames()");
  return { zoom, pan };
}

const scenarios = [
  { name: "plano", url: `${base}/dev/estudio?forma=plano&reps=10&perf=1`, rep: ["A lo ancho", "A lo alto"] },
  { name: "tubo", url: `${base}/dev/estudio?forma=tubo&reps=10&perf=1`, rep: ["A lo ancho", "A lo alto"] },
  { name: "circulo-rombos", url: `${base}/dev/estudio?forma=circulo&motivo=rombos&reps=10&perf=1`, rep: ["A lo ancho", "A lo alto"] },
  { name: "circulo-copa", url: `${base}/dev/estudio?forma=circulo&perf=1`, rep: ["A lo ancho"] },
];
const out = { cpuRate: Number(cpuRate), userAgent: await evaluate("navigator.userAgent"), results: {} };
if (traceOn === "1") await send("Tracing.start", { traceConfig: { recordMode: "recordAsMuchAsPossible", includedCategories: ["blink.user_timing", "devtools.timeline"] }, bufferUsageReportingInterval: 1000, transferMode: "ReportEvents" });
const only = process.env.SCEN ? process.env.SCEN.split(",") : null;
for (const s of scenarios.filter((x) => !only || only.includes(x.name))) {
  await load(s.url);
  await reset();
  await paintClicks(50);
  await keyboardPaints(20);
  await wait(500);
  const sumPaint = await summary();
  await reset();
  const strokeFrames = await stroke(90);
  const sumStroke = await summary();
  const strokeSamples = await evaluate("window.__loopitaPerf.recorder.samples.map((s) => [Math.round(s.t0), Math.round(s.queuedAt - s.t0), Math.round(s.editorMs ?? -1), Math.round(s.previewMs), Math.round(s.ms)])");
  const strokeSpans = await evaluate("window.__loopitaPerf.recorder.spans.map((s) => [s.name, Math.round(s.start), +(s.end - s.start).toFixed(1)])");
  await reset();
  await repeats(20, s.rep);
  await wait(800);
  const sumRep = await summary();
  const repSpans = await evaluate("window.__loopitaPerf.recorder.spans.map((s) => [s.name, Math.round(s.start), +(s.end - s.start).toFixed(1)])");
  await reset();
  const zp = await zoomAndPan();
  await wait(2000); // deja correr validación y autoguardado diferidos
  const after = await summary();
  const visibility = await evaluate("document.visibilityState");
  if (visibility !== "visible") console.error(`${s.name}: la página quedó ${visibility}; los números no valen (sin frames)`);
  out.results[s.name] = { visibility, paint: sumPaint, stroke: { ...sumStroke, frames: strokeFrames, samples: strokeSamples, spans: strokeSpans }, repSpans, repeats: sumRep, zoomPan: zp, idleValidations: after.validations };
  console.log(s.name, JSON.stringify({ paint: sumPaint.edits.paint, strokeP95: sumStroke.edits.stroke?.p95, strokeMax: sumStroke.edits.stroke?.max, strokeFps: strokeFrames.fps, rep: sumRep.edits.repeats, zoom: zp.zoom.fps, pan: zp.pan.fps, val: [sumPaint.validations, sumStroke.validations, sumRep.validations], dropped: [sumPaint.dropped, sumStroke.dropped, sumRep.dropped] }));
  if (shots === "1") {
    await send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await evaluate(`(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Ajustar').click(); return true; })()`);
    await wait(800);
    const clip = await evaluate(`(() => { const e = document.querySelector('[data-zone=preview]'); e.scrollIntoView({ block: 'start' }); const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: Math.min(r.height, 1000), scale: 1 }; })()`);
    await wait(400);
    const { data } = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
    writeFileSync(`${outDir}/estudio-${s.name}.png`, Buffer.from(data, "base64"));
    await send("Emulation.setCPUThrottlingRate", { rate: Number(cpuRate) });
  }
}
if (traceOn === "1") {
  const done = new Promise((r) => (traceDone = r));
  await send("Tracing.end");
  await done;
  writeFileSync(`${outDir}/trace-${tag}.json`, JSON.stringify({ traceEvents: traceChunks }));
}
writeFileSync(`${outDir}/t10-${tag}.json`, JSON.stringify(out, null, 1));
clearInterval(keepAlive);
ws.close();
process.exit(0);

// CA-P7: ventanas `loopita:edit-to-paint:*` contra tramos `loopita:validate:*` en un trace de Chrome.
function revisarTrace(file) {
  const ev = JSON.parse(readFileSync(file, "utf8")).traceEvents;
  const spans = [];
  const open = new Map();
  for (const e of ev) {
    if (!e.name?.startsWith("loopita:")) continue;
    const k = `${e.name}|${e.id ?? e.id2?.local ?? ""}`;
    // Chrome reutiliza el id de `performance.measure`: se emparejan en orden (b abre, e cierra el último abierto).
    if (e.ph === "b") { const l = open.get(k) ?? []; const sp = { name: e.name, start: e.ts / 1000 }; l.push(sp); open.set(k, l); spans.push(sp); }
    else if (e.ph === "e") { const sp = open.get(k)?.pop(); if (sp) sp.end = e.ts / 1000; }
  }
  const all = spans.filter((s) => s.end !== undefined);
  const edits = all.filter((s) => s.name.startsWith("loopita:edit-to-paint"));
  const vals = all.filter((s) => s.name.startsWith("loopita:validate"));
  const over = vals.filter((v) => edits.some((e) => v.start < e.end && v.end > e.start));
  const byKind = {};
  for (const e of edits) (byKind[e.name] ??= []).push(e.end - e.start);
  const sum = Object.fromEntries(Object.entries(byKind).map(([k, v]) => { v.sort((a, b) => a - b); return [k, { n: v.length, p50: v[Math.ceil(0.5 * v.length) - 1], p95: v[Math.ceil(0.95 * v.length) - 1] }]; }));
  // Tareas largas del hilo principal (devtools.timeline RunTask > 50 ms).
  const long = ev.filter((e) => e.name === "RunTask" && e.ph === "X" && e.dur > 50000).length;
  console.log(JSON.stringify({ edits: edits.length, validations: vals.length, validationsOverlappingAnEditWindow: over.map((v) => ({ name: v.name, ms: +(v.end - v.start).toFixed(2), overlapsBy: edits.filter((e) => v.start < e.end && v.end > e.start).map((e) => ({ kind: e.name, startedBeforeInput: v.start < e.start, msAfterInput: +(v.start - e.start).toFixed(2) })) })), editToPaintFromTrace: sum, longTasksOver50ms: long }, null, 1));
}
