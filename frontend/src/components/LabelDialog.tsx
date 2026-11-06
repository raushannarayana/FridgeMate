import { useEffect, useState } from "react"; import { useQuery, useQueryClient } from "@tanstack/react-query"; import { Download, Printer, RefreshCw, Radio, Ban, Smartphone } from "lucide-react";
import { api, download, LabelInfo, Food } from "../lib/api"; import { Modal, ErrorMsg, Spinner, fmtDate } from "./ui"; import { supportsWebNfc, writeNfcUrl, nfcErrorMessage } from "../lib/nfc"; import { ScanResult } from "../pages/Scan";
export default function LabelDialog({ food, onClose }: { food: Food; onClose: () => void }) {
  const qc = useQueryClient(); const [img, setImg] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<any>(null); const [busy, setBusy] = useState(false); const [sim, setSim] = useState<string | null>(null);
  const labels = useQuery({ queryKey: ["labels", food.id], queryFn: () => api<LabelInfo[]>(`/foods/${food.id}/labels`) });
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => api<{ label_url_is_local?: boolean; label_base_url?: string }>("/config") });
  const qr = labels.data?.find((l) => l.type === "QR" && l.status === "active"); const nfc = labels.data?.find((l) => l.type === "NFC" && l.status === "active"); const nfcAny = labels.data?.find((l) => l.type === "NFC");
  useEffect(() => { let u: string | null = null; setImg(null);
    if (labels.data && qr) api<Blob>(`/foods/${food.id}/label?type=combined`, { blob: true }).then((b) => { u = URL.createObjectURL(b); setImg(u); }).catch(() => {}); return () => { if (u) URL.revokeObjectURL(u); }; }, [labels.data]);
  const act = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); setErr(null); setMsg(null); try { await fn(); if (ok) setMsg(ok); await qc.invalidateQueries({ queryKey: ["labels", food.id] }); await qc.invalidateQueries({ queryKey: ["foods"] }); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const post = (p: string) => api(`/foods/${food.id}/labels/${p}`, { method: "POST" });
  const writeTag = () => act(async () => {
    try { setMsg("Hold an NTAG sticker against the back of your phone..."); await writeNfcUrl(nfc!.url!, async () => window.confirm("This tag already contains data. Overwrite it?")); await post("nfc/written"); }
    catch (e: any) { throw new Error(nfcErrorMessage(e)); }
  }, "NFC tag written. Tap it with any phone to test.");
  const printImg = () => { const w = window.open(""); if (w && img) w.document.write(`<img src="${img}" style="width:5cm" onload="print()">`); };
  return <Modal title={`Labels - ${food.name}`} onClose={onClose}>
    {labels.isLoading ? <Spinner /> : <div className="space-y-5">
      <section aria-label="QR label"><h3 className="font-semibold">QR label <span className="text-xs font-normal text-stone-500">(primary identity)</span></h3>
        {cfg.data?.label_url_is_local && <p role="alert" className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">This QR points to <b>{cfg.data.label_base_url}</b>, which phones cannot open. Open FridgeMate through your computer's network address (e.g. http://192.168.x.x:8000) or an https tunnel such as ngrok, or set <code>PUBLIC_URL</code>, then the QR is created correctly.</p>}
        {qr && img ? <div className="mt-2 flex flex-col items-center gap-2"><img src={img} alt={`QR label for ${food.name}`} className="w-56 rounded-xl border" />
          <div className="flex flex-wrap justify-center gap-2"><button className="btn-ghost" onClick={() => download(`/foods/${food.id}/label?type=combined`, `${food.name}-label.png`)}><Download className="h-4 w-4" />PNG</button>
            <button className="btn-ghost" onClick={() => download(`/foods/${food.id}/label?type=combined&fmt=pdf`, `${food.name}-label.pdf`)}><Download className="h-4 w-4" />PDF</button>
            <button className="btn-ghost" onClick={printImg}><Printer className="h-4 w-4" />Print 5x5 cm</button>
            <button className="btn-ghost" onClick={() => download(`/fridges/${food.fridge_id}/labels/sheet`, "fridgemate-a4-labels.pdf")}>A4 sheet</button></div>
          <p className="text-xs text-stone-500">Scans: {qr.scan_count} - last {fmtDate(qr.last_scanned)}</p>
          <div className="flex gap-2"><button className="btn-ghost" disabled={busy} onClick={() => act(() => post("qr/regenerate"), "New QR created - the old one stopped working.")}><RefreshCw className="h-4 w-4" />Regenerate</button>
            <button className="btn-ghost" disabled={busy} onClick={() => window.confirm("Deactivate this QR code?") && act(() => post("qr/deactivate"))}><Ban className="h-4 w-4" />Deactivate</button></div></div>
          : <div className="mt-2"><p className="text-sm text-stone-600">No active QR label.</p><button className="btn mt-2" disabled={busy} onClick={() => act(() => post("qr/regenerate"))}>Create QR label</button></div>}
      </section>
      <section aria-label="NFC label" className="rounded-2xl bg-stone-50 p-3"><h3 className="flex items-center gap-2 font-semibold"><Radio className="h-4 w-4" />NFC tag <span className="text-xs font-normal text-stone-500">(optional extra)</span></h3>
        {!nfc ? <div className="mt-2"><p className="text-sm text-stone-600">{nfcAny ? "NFC label is inactive." : "Add a tap-to-open NFC sticker alongside the QR code."}</p><button className="btn-ghost mt-2" disabled={busy} onClick={() => act(() => post("nfc/regenerate"), "NFC label created. Now write it to a tag.")}>Create NFC label</button></div> :
          <div className="mt-2 space-y-2 text-sm"><p>Status: <b>active</b> - {nfc.written_at ? `written ${fmtDate(nfc.written_at)}` : "not written to a tag yet"} - scans: {nfc.scan_count}</p>
            {supportsWebNfc() ? <button className="btn" disabled={busy} onClick={writeTag}><Radio className="h-4 w-4" />Write to NFC tag</button> :
              <p className="rounded-lg bg-amber-50 p-2 text-amber-900">Writing needs <b>Chrome on Android over HTTPS</b> with NFC on. Open this page on a compatible phone. (iPhone can tap tags already written, but cannot write from the web.)</p>}
            <p className="text-xs text-stone-500">The tag stores only a secure link - never names, dates or personal data. Permanent tag locking is not offered: Web NFC has no lock API.</p>
            <div className="flex flex-wrap gap-2"><button className="btn-ghost" disabled={busy} onClick={() => act(() => post("nfc/regenerate"), "NFC token replaced - re-write the tag.")}><RefreshCw className="h-4 w-4" />Regenerate</button>
              <button className="btn-ghost" disabled={busy} onClick={() => act(() => post("nfc/deactivate"))}><Ban className="h-4 w-4" />Deactivate</button>
              <button className="btn-ghost" onClick={() => api<{ demo: boolean }>("/config").then((c) => c.demo ? setSim(nfc.url!.split("/q/")[1]) : setErr(new Error("Simulation is available in demo mode only")))}><Smartphone className="h-4 w-4" />SIMULATED NFC TAP</button></div></div>}
      </section>
      {sim && <div className="rounded-2xl border-2 border-dashed border-amber-400 p-3"><p className="mb-2 text-xs font-bold uppercase text-amber-700">Simulated tap - not a physical NFC test</p><ScanResult token={sim} /></div>}
      {msg && <p role="status" className="rounded-lg bg-brand-50 p-2 text-sm text-brand-700">{msg}</p>}<ErrorMsg e={err} />
    </div>}</Modal>;
}
