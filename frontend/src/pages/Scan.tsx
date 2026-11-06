import { useEffect, useRef, useState } from "react"; import { Link, useNavigate, useParams } from "react-router-dom"; import { useQuery } from "@tanstack/react-query"; import { Html5Qrcode } from "html5-qrcode"; import { Camera, Radio, ShieldAlert } from "lucide-react";
import FoodImage from "../components/FoodImage"; import { api, labelToken, tokenFrom } from "../lib/api"; import { deniedMessage, checkCameraSupport, describeCameraError, openRearCamera, stopStream } from "../lib/camera"; import { createDecoder, startScanLoop } from "../lib/qrscan"; import { Badge, ErrorMsg, Spinner, fmtDate } from "../components/ui"; import { scanNfcOnce, supportsWebNfc, nfcErrorMessage } from "../lib/nfc";
export function ScanResult({ token }: { token: string }) {
  const q = useQuery({ queryKey: ["scan", token], queryFn: () => api<any>(`/qr/${encodeURIComponent(token)}`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <div className="card flex gap-3 border-red-200 bg-red-50" role="alert"><ShieldAlert className="h-6 w-6 shrink-0 text-red-600" /><div><p className="font-semibold text-red-800">Can't open this label</p><p className="text-sm text-red-700">{(q.error as Error).message}</p></div></div>;
  const f = q.data; const member = f.access === "member";
  return <div className="card space-y-2"><div className="flex items-center gap-3"><FoodImage name={f.name} category={f.category} size={56} /><h2 className="flex-1 text-xl font-bold">{f.name}</h2><Badge k={f.status} /></div>
    <div className="flex gap-1"><Badge k={f.permission} /><span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold">via {f.via}</span></div>
    {f.owner && <p>Owner: <b>{f.owner}</b></p>}{f.expiry_date && <p>Expires: {fmtDate(f.expiry_date)} {f.expiry_type === "estimated" && "(estimated)"}</p>}
    {member ? <p className="text-sm text-stone-600">{f.quantity} {f.unit} - {f.category} - stored {fmtDate(f.storage_date)}{f.location && ` - ${f.location}`}{f.notes && <><br />{f.notes}</>}</p> : <p className="rounded-lg bg-stone-50 p-2 text-sm text-stone-500">Log in as a member of this refrigerator to see full details.</p>}
    <p className="text-xs text-stone-500">A date alone never guarantees safety.</p>{member && <Link className="btn-ghost" to={`/app/food/${f.id}`}>Open item</Link>}</div>;
}
export function PublicScan() { const { token } = useParams(); return <div className="mx-auto max-w-md space-y-3 p-4"><p className="font-extrabold">Fridge<span className="text-brand-600">Mate</span></p><ScanResult token={token!} /><Link to="/app" className="text-sm text-brand-700 underline">Open FridgeMate</Link></div>; }
export default function Scan() {
  const [token, setToken] = useState<string | null>(null); const [running, setRunning] = useState(false); const [err, setErr] = useState<string | null>(null); const [manual, setManual] = useState(""); const cam = useRef<{ stream: MediaStream; stopLoop: () => void } | null>(null); const video = useRef<HTMLVideoElement>(null); const [mode, setMode] = useState(""); const attempt = useRef(0);
  const done = useRef(false); const lastBad = useRef(""); const [facing, setFacing] = useState(""); const result = useRef<HTMLDivElement>(null);
  const release = () => { const c = cam.current; cam.current = null; c?.stopLoop(); stopStream(c?.stream); if (video.current) video.current.srcObject = null; };
  const stop = async () => { attempt.current++; release(); setRunning(false); };
  useEffect(() => release, []);
  useEffect(() => { const h = () => { if (document.hidden) stop(); }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h); }, []); // release the camera when the tab is hidden
  useEffect(() => { if (token) result.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [token]);
  // Called for every frame that contains a QR code. A FridgeMate label ends the scan and shows the food; anything else keeps scanning.
  const onDecoded = (text: string) => { if (done.current) return; const t = labelToken(text);
    if (!t) { if (lastBad.current !== text) { lastBad.current = text; setErr("That QR code is not a FridgeMate label. Keep scanning, or point the camera at a FridgeMate label."); } return; }
    done.current = true; setErr(null); navigator.vibrate?.(80); setToken(t); stop(); };
  const start = async () => { setErr(null); setToken(null); done.current = false; lastBad.current = ""; const my = ++attempt.current;
    const problem = checkCameraSupport(); if (problem) return setErr(problem.message);
    try { const st = await navigator.permissions?.query({ name: "camera" as PermissionName }); if (st?.state === "denied") return setErr(deniedMessage()); } catch {} // not supported everywhere - ignore
    setRunning(true);
    try {
      const { stream, facing } = await openRearCamera(); const v = video.current!; v.srcObject = stream; v.muted = true; v.setAttribute("playsinline", "true");
      cam.current = { stream, stopLoop: () => {} }; setFacing(facing); await v.play();
      const decoder = await createDecoder(); setMode(decoder.mode); if (my !== attempt.current) return stopStream(stream); // Stop was pressed while the camera was starting
      cam.current.stopLoop = startScanLoop(v, decoder, onDecoded);
    } catch (e: any) { if (my !== attempt.current) return; release(); setRunning(false); setErr(describeCameraError(e).message); } };
  const fromPhoto = async (file?: File) => { if (!file) return; setErr(null); setToken(null);
    try { const h = new Html5Qrcode("reader-file", false); const t = await h.scanFile(file, false); h.clear(); const l = labelToken(t); if (l) setToken(l); else setErr("That QR code is not a FridgeMate label."); }
    catch { setErr("No QR code found in that photo. Take a closer, sharper picture of the label and try again."); } };
  const nfc = async () => { setErr(null); try { setToken(tokenFrom(await scanNfcOnce())); } catch (e) { setErr(nfcErrorMessage(e)); } };
  return <div className="space-y-4"><h1 className="text-2xl font-bold">Scan a label</h1>
    <div className="card space-y-3"><div id="reader" data-facing={facing} data-decoder={mode} className={running ? "relative overflow-hidden rounded-xl bg-black" : "hidden"}><video ref={video} className="block w-full" autoPlay muted playsInline /><div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="aspect-square h-2/3 rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" /></div></div>{!running ? <button className="btn" onClick={start}><Camera className="h-4 w-4" />Start camera</button> : <button className="btn-ghost" onClick={stop}>Stop camera</button>}
      <label className="btn-ghost cursor-pointer">Scan from photo<input type="file" accept="image/*" className="sr-only" onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ""; }} /></label><div id="reader-file" className="hidden" />
      {supportsWebNfc() && <button className="btn-ghost" onClick={nfc}><Radio className="h-4 w-4" />Scan NFC tag</button>}{err && <p role="alert" className="err">{err}</p>}</div>
    <form className="card flex gap-2" onSubmit={(e) => { e.preventDefault(); manual && setToken(tokenFrom(manual)); }}><label className="sr-only" htmlFor="m">Code or link</label><input id="m" className="input" placeholder="Paste a QR link or code" value={manual} onChange={(e) => setManual(e.target.value)} /><button className="btn">Look up</button></form>
    {token && <div ref={result}><ScanResult token={token} /></div>}</div>;
}
