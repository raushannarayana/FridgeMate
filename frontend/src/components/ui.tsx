import { ReactNode, useEffect } from "react"; import { Loader2, X } from "lucide-react";
const MAP: Record<string, [string, string]> = {
  personal: ["Personal", "bg-blue-100 text-blue-800"], shared: ["Shared", "bg-green-100 text-green-800"], available: ["Available to take", "bg-purple-100 text-purple-800"],
  expiring: ["Expiring soon", "bg-orange-100 text-orange-800"], expired: ["Expired", "bg-red-100 text-red-800"], consumed: ["Consumed", "bg-stone-200 text-stone-700"],
  removed: ["Removed", "bg-stone-200 text-stone-700"], fresh: ["Fresh", "bg-emerald-100 text-emerald-800"] };
export const Badge = ({ k }: { k: string }) => { const [t, c] = MAP[k] ?? [k, "bg-stone-100 text-stone-700"]; return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>{t}</span>; };
export const Spinner = () => <div className="flex justify-center p-10" role="status" aria-label="Loading"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
export const Empty = ({ title, hint }: { title: string; hint?: string }) => <div className="card text-center"><p className="font-semibold">{title}</p>{hint && <p className="mt-1 text-sm text-stone-500">{hint}</p>}</div>;
export const ErrorMsg = ({ e }: { e: any }) => e ? <p role="alert" className="err">{e.message ?? String(e)}</p> : null;
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button className="btn-ghost !p-2" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>{children}</div></div>;
}
export const Stat = ({ label, value, tone = "" }: { label: string; value: ReactNode; tone?: string }) => <div className="card"><p className="text-sm text-stone-500">{label}</p><p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p></div>;
export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "-");
