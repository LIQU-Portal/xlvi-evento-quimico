"use client";

import { Camera, CameraOff, CheckCircle2, ChevronLeft, Keyboard, TriangleAlert, Volume2, VolumeX, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { localEventTime } from "@/lib/program-agenda";
import { sessionWindow, type AttendanceDirection, type AttendanceResult, type AttendanceSession } from "@/lib/attendance-rules";
import { acceptCameraRead, attendanceFeedback, newCameraReadGate } from "@/lib/attendance-feedback";

const dateLabel = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short",
}).format(new Date(value));
const timeLabel = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));

export function AttendanceScanner({ sessions }: { sessions: AttendanceSession[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [direction, setDirection] = useState<AttendanceDirection>("entry");
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<"off" | "starting" | "on">("off");
  const [cameraError, setCameraError] = useState("");
  const [reference, setReference] = useState("");
  const [manual, setManual] = useState(false);
  const [reason, setReason] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [sound, setSound] = useState(false);
  const [cameraFeedback, setCameraFeedback] = useState(false);
  const [recent, setRecent] = useState<Array<{ key: number; sessionId: string; direction: AttendanceDirection; name: string; id: string; at: string }>>([]);
  const audio = useRef<AudioContext | null>(null);
  const cameraReadGate = useRef(newCameraReadGate());
  const readSequence = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const cameraGeneration = useRef(0);
  const inFlight = useRef(false);
  const lastRead = useRef({ key: "", time: 0 });
  const selected = sessions.find((s) => s.id === selectedId);
  const [counts, setCounts] = useState(() => Object.fromEntries(sessions.map((s) => [s.id, { entries: s.entries ?? 0, exits: s.exits ?? 0 }])));

  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);

  useEffect(() => {
    if (busy || !result) return;
    const timer = setTimeout(() => setCameraFeedback(false), 2800);
    return () => clearTimeout(timer);
  }, [busy, result]);

  async function toggleSound() {
    if (sound) { setSound(false); return; }
    try {
      const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      audio.current ??= new Audio();
      await audio.current.resume();
      setSound(true);
    } catch { setSound(false); }
  }

  const notifyRead = useCallback((outcome: string) => {
    try {
      navigator.vibrate?.(outcome === "recorded" ? 150 : outcome === "duplicate" ? [50, 60, 50] : [150, 80, 150]);
      const context = audio.current;
      if (!sound || !context || context.state !== "running") return;
      const notes = outcome === "recorded" ? [880, 1175] : outcome === "duplicate" ? [660, 660] : [250];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * .13;
        oscillator.frequency.value = frequency;
        oscillator.connect(gain); gain.connect(context.destination);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.1, start + .01);
        gain.gain.exponentialRampToValueAtTime(.001, start + .12);
        oscillator.start(start); oscillator.stop(start + .13);
      });
    } catch { /* Audio/vibration are optional; never change a confirmed outcome. */ }
  }, [sound]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  const stopCamera = useCallback(() => {
    cameraGeneration.current += 1;
    controls.current?.stop();
    controls.current = null;
    cameraReadGate.current = newCameraReadGate();
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
    setCamera("off");
  }, []);

  useEffect(() => {
    const hide = () => { if (document.hidden) stopCamera(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); stopCamera(); };
  }, [stopCamera]);

  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => {
      if (!sessionWindow(selected)) stopCamera();
    }, 15000);
    return () => clearInterval(timer);
  }, [selected, stopCamera]);

  const submit = useCallback(async (value: string, source: "qr" | "manual" = "qr", fromCamera = false) => {
    if (!selected || inFlight.current || !value.trim()) return;
    const key = `${selected.id}:${direction}:${value}`;
    const time = Date.now();
    if (source === "qr" && !fromCamera && lastRead.current.key === key && time - lastRead.current.time < 3000) return;
    lastRead.current = { key, time };
    inFlight.current = true;
    setBusy(true);
    setResult(null);
    setCameraFeedback(true);
    try {
      const response = await fetch("/api/asistencia/lectura", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selected.id, direction, reference: value, source, reason }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      const next = data as AttendanceResult;
      setResult(next);
      notifyRead(next.outcome);
      if (next.outcome === "recorded") {
        setCounts((previous) => {
          const count = previous[selected.id] ?? { entries: selected.entries ?? 0, exits: selected.exits ?? 0 };
          return { ...previous, [selected.id]: {
            entries: count.entries + (direction === "entry" ? 1 : 0),
            exits: count.exits + (direction === "exit" ? 1 : 0),
          } };
        });
        const at = next.recordedAt ?? new Date().toISOString();
        const sequence = ++readSequence.current;
        setRecent((previous) => [{ key: sequence, sessionId: selected.id, direction,
          name: next.participantName ?? "Participante", id: next.participantId ?? "", at }, ...previous].slice(0, 3));
      }
    } catch (error) {
      setResult({ outcome: "error", message: error instanceof Error && error.name === "Error"
        ? error.message : "Sin confirmación. Revisa internet y vuelve a escanear; no se duplicará." });
      notifyRead("error");
    } finally {
      setBusy(false);
      setReference("");
      inFlight.current = false;
      // Mantener el foco del lector físico sin abrir el teclado durante el escaneo con cámara.
      if (source === "qr" && !fromCamera) setTimeout(() => input.current?.focus(), 0);
    }
  }, [selected, direction, reason, notifyRead]);

  // El callback de la cámara siempre usa la sesión/modo actuales.
  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; }, [submit]);

  async function startCamera() {
    if (!video.current || camera !== "off") return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("La cámara necesita HTTPS. Abre el enlace Preview o usa el escáner físico."); return;
    }
    setCameraError("");
    setCamera("starting");
    const generation = ++cameraGeneration.current;
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (generation !== cameraGeneration.current) return;
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 250 });
      const handle = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } },
        video.current!, (decoded) => {
          if (inFlight.current) return;
          const value = decoded?.getText() ?? null;
          if (acceptCameraRead(cameraReadGate.current, value, Date.now()) && value) void submitRef.current(value, "qr", true);
        },
      );
      if (generation !== cameraGeneration.current) { handle.stop(); return; }
      controls.current = handle;
      setCamera("on");
      video.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    } catch {
      if (generation !== cameraGeneration.current) return;
      stopCamera();
      setCameraError("No pudimos abrir la cámara. Permite su uso en el navegador o utiliza el escáner físico.");
    }
  }

  if (!selected) {
    const today = localEventTime(now).date;
    const todays = sessions.filter((s) => localEventTime(new Date(s.startsAt)).date === today);
    return <section className="attendance-picker">
      <h1>¿Dónde vas a registrar?</h1>
      <p>Elige tu sesión asignada.</p>
      <button className="attendance-back" onClick={() => window.location.reload()}>Actualizar sesiones</button>
      {!todays.length && <div className="attendance-empty">No tienes sesiones asignadas para hoy. Contacta a tu coordinador.</div>}
      {todays.map((s) => <button className="attendance-session-choice" key={s.id}
        onClick={() => { setSelectedId(s.id); setDirection("entry"); setResult(null); setReference(""); setManual(false); }}>
        <span>{s.isSimulation ? "SIMULACIÓN · " : ""}{s.type} · {dateLabel(s.startsAt)}</span>
        <strong>{s.title}</strong>
        <span>{timeLabel(s.startsAt)}–{timeLabel(s.endsAt)} · {s.venue}</span>
        <em>{sessionWindow(s, now) ? "Abrir lector →" : "Ver sesión →"}</em>
      </button>)}
    </section>;
  }

  const allowed = sessionWindow(selected, now);
  const counter = counts[selected.id] ?? { entries: selected.entries ?? 0, exits: selected.exits ?? 0 };
  const feedback = attendanceFeedback(result, direction, busy);
  const recentForSession = recent.filter((read) => read.sessionId === selected.id);
  return <section className="attendance-scan">
    <button className="attendance-back" disabled={busy} onClick={() => { stopCamera(); setSelectedId(null); setResult(null); }}><ChevronLeft size={18} /> Cambiar sesión</button>
    {selected.isSimulation && <div className="attendance-simulation">SIMULACIÓN · No cuenta como asistencia real</div>}
    <h1>{selected.title}</h1>
    <p>{dateLabel(selected.startsAt)} · {timeLabel(selected.startsAt)}–{timeLabel(selected.endsAt)}<br />{selected.venue}</p>
    <div className="attendance-direction" aria-label="Tipo de registro">
      <button className={direction === "entry" ? "selected" : ""} disabled={busy} onClick={() => { stopCamera(); setDirection("entry"); setResult(null); }}>Entrada</button>
      {selected.type === "Conferencia" && <button className={direction === "exit" ? "selected exit" : ""} disabled={busy}
        onClick={() => { stopCamera(); setDirection("exit"); setResult(null); }}>Salida</button>}
    </div>
    <div className={`attendance-mode ${direction === "exit" ? "exit" : ""}`}>Registrando {direction === "entry" ? "ENTRADAS" : "SALIDAS"}</div>
    {!allowed && <p className="attendance-alert" role="status">Lector cerrado. Disponible únicamente el día de esta sesión, de 00:00 a 23:59 (hora de Ciudad de México).</p>}
    <button className="attendance-sound-toggle" onClick={() => void toggleSound()} aria-pressed={sound}>
      {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}{sound ? "Sonido activado" : "Activar sonido de confirmación"}
    </button>
    <div className="attendance-result attendance-readout" data-tone={feedback.tone} role="status" aria-live="polite" aria-atomic="true">
      <div className="attendance-readout-heading">{busy ? <span className="attendance-spinner" /> : feedback.tone === "success" ? <CheckCircle2 size={38} aria-hidden="true" />
        : feedback.tone === "error" || feedback.tone === "uncertain" ? <XCircle size={38} aria-hidden="true" />
        : feedback.tone === "duplicate" ? <TriangleAlert size={38} aria-hidden="true" /> : <Camera size={30} aria-hidden="true" />}
        <strong>{feedback.title}</strong>
      </div>
      {!busy && result?.participantName && <span className="attendance-readout-name">{result.participantName}</span>}
      {!busy && result?.participantId && <small>{result.participantId}{result.recordedAt ? ` · ${timeLabel(result.recordedAt)}` : ""}</small>}
      <span className="attendance-readout-next">{feedback.detail}</span>
    </div>
    <div className="attendance-camera" hidden={camera === "off"}>
      <video ref={video} autoPlay muted playsInline aria-label="Cámara para leer códigos QR" />
      <span className="attendance-viewfinder" aria-hidden="true" />
      {cameraFeedback && (busy || result) && <div className="attendance-camera-feedback" data-tone={feedback.tone} aria-hidden="true">
        {busy ? <span className="attendance-spinner" /> : feedback.tone === "success" ? <CheckCircle2 size={52} />
          : feedback.tone === "duplicate" ? <TriangleAlert size={52} /> : <XCircle size={52} />}
        <strong>{feedback.title}</strong>
        {!busy && result?.participantName && <span>{result.participantName}</span>}
        <small>{feedback.tone === "success" || feedback.tone === "duplicate" ? "Retira este QR · siguiente persona" : feedback.detail}</small>
      </div>}
    </div>
    <button className="attendance-primary" disabled={!allowed || busy || camera === "starting"} onClick={camera === "on" ? stopCamera : startCamera}>
      {camera === "on" ? <CameraOff /> : <Camera />}{camera === "starting" ? "Abriendo cámara…" : camera === "on" ? "Pausar cámara" : "Abrir cámara"}
    </button>
    {cameraError && <p className="attendance-alert" role="alert">{cameraError}</p>}
    <form className="attendance-input-form" onSubmit={(event) => { event.preventDefault(); void submit(reference, manual ? "manual" : "qr"); }}>
      <label htmlFor="attendance-reference"><Keyboard size={17} /> {manual ? "ID de participante" : "Escáner físico: lee el QR y presiona Enter"}</label>
      <input ref={input} id="attendance-reference" autoComplete="off" spellCheck={false} maxLength={200} required value={reference}
        disabled={!allowed || busy} onChange={(e) => setReference(manual ? e.target.value.toUpperCase() : e.target.value)} placeholder={manual ? "EQ26-XXXXXXXXXX" : "Haz clic aquí para usar el escáner"} />
      {manual && <><label htmlFor="attendance-reason">Motivo de captura manual</label><input id="attendance-reason" value={reason} minLength={5} maxLength={240} required onChange={(e) => setReason(e.target.value)} placeholder="Ej. Pantalla dañada, QR ilegible" /></>}
      <button className="attendance-secondary" disabled={!allowed || busy || !reference.trim()} type="submit">Registrar {direction === "entry" ? "entrada" : "salida"}</button>
    </form>
    <button className="attendance-back" disabled={busy} onClick={() => { setManual(!manual); setReference(""); }}>{manual ? "Volver al escáner" : "¿No se puede leer? Capturar ID"}</button>
    <p className="attendance-count">Entradas: <strong>{counter.entries}</strong>{selected.type === "Conferencia" && <> · Salidas: <strong>{counter.exits}</strong></>}<small>Conteo de este panel. Se actualiza al volver a abrirlo.</small></p>
    {!!recentForSession.length && <section className="attendance-recent" aria-label="Últimos registros guardados en este dispositivo">
      <h2>Últimos registros guardados</h2><p>En este dispositivo · sin incluir duplicados ni rechazos</p>
      <ol>{recentForSession.map((read) => <li key={read.key}><CheckCircle2 size={20} aria-hidden="true" /><div><strong>{read.name}</strong><small>{read.direction === "entry" ? "Entrada" : "Salida"} · {timeLabel(read.at)} · {read.id}</small></div></li>)}</ol>
    </section>}
    <Link className="attendance-back" href="/mi-cuenta">Ir a Mi cuenta</Link>
  </section>;
}
