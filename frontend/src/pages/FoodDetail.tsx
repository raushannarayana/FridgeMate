import FoodImage from "../components/FoodImage"; import { useState } from "react"; import { Link, useNavigate, useParams } from "react-router-dom"; import { useForm } from "react-hook-form"; import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Food } from "../lib/api"; import { useAuth } from "../lib/auth"; import { Badge, ErrorMsg, Spinner, fmtDate } from "../components/ui"; import LabelDialog from "../components/LabelDialog";
export default function FoodDetail() {
  const { id } = useParams(); const { user } = useAuth(); const nav = useNavigate(); const qc = useQueryClient(); const [lab, setLab] = useState(false); const [err, setErr] = useState<any>(null); const [saved, setSaved] = useState(false);
  const q = useQuery({ queryKey: ["food", id], queryFn: () => api<Food>(`/foods/${id}`) }); const f = q.data;
  const { register, handleSubmit } = useForm({ values: f ? { name: f.name, quantity: f.quantity, unit: f.unit, expiry_date: f.expiry_date ?? "", permission: f.permission, category: f.category, notes: f.notes, location: f.location } : undefined });
  if (q.isLoading) return <Spinner />; if (q.error || !f) return <ErrorMsg e={q.error ?? new Error("Not found")} />; const mine = f.owner_id === user.id;
  return <div className="space-y-4"><Link to="/app/fridge" className="text-sm text-brand-700 underline">&larr; Back</Link>
    <div className="card"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><FoodImage name={f.name} category={f.category} size={72} /><h1 className="text-2xl font-bold">{f.name}</h1></div><div className="flex gap-1"><Badge k={f.status} /><Badge k={f.permission} /></div></div>
      <p className="mt-2 text-sm text-stone-600">Owner: {f.owner} - Stored {fmtDate(f.storage_date)} - Expires {fmtDate(f.expiry_date)} {f.expiry_type === "estimated" && "(estimated - not a manufacturer date)"}</p>
      <p className="mt-1 text-xs text-stone-500">An expiry date is not a guarantee of safety. Check smell, look and storage before eating.</p>{mine && <button className="btn mt-3" onClick={() => setLab(true)}>QR / NFC labels</button>}</div>
    {mine ? <form className="card grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(async (v: any) => { try { setErr(null); await api(`/foods/${id}`, { method: "PATCH", body: { ...v, quantity: Number(v.quantity), expiry_date: v.expiry_date || null } }); await qc.invalidateQueries(); setSaved(true); } catch (e) { setErr(e); } })}>
      <h2 className="font-bold sm:col-span-2">Correct or update details</h2>
      {[["name", "Name"], ["category", "Category"], ["quantity", "Quantity"], ["unit", "Unit"], ["location", "Storage location"]].map(([k, l]) => <div key={k}><label className="label" htmlFor={k}>{l}</label><input id={k} className="input" {...register(k as any)} /></div>)}
      <div><label className="label" htmlFor="ed">Expiry date</label><input id="ed" type="date" className="input" {...register("expiry_date")} /></div>
      <div><label className="label" htmlFor="pm">Permission</label><select id="pm" className="input" {...register("permission")}><option value="personal">Personal</option><option value="shared">Shared</option><option value="available">Available to take</option></select></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="nt">Notes</label><textarea id="nt" className="input" {...register("notes")} /></div><ErrorMsg e={err} />{saved && <p role="status" className="text-sm text-brand-700">Saved.</p>}
      <div className="flex gap-2 sm:col-span-2"><button className="btn">Save changes</button><button type="button" className="btn-ghost" onClick={() => nav("/app/fridge")}>Done</button></div></form> : <p className="text-sm text-stone-500">Only the owner can edit this item.</p>}
    {lab && <LabelDialog food={f} onClose={() => setLab(false)} />}</div>;
}
