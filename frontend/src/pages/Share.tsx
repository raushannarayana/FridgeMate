import FoodImage from "../components/FoodImage"; import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"; import { api, Food } from "../lib/api"; import { useAuth } from "../lib/auth"; import { Badge, Empty, ErrorMsg, Spinner, fmtDate } from "../components/ui";
export default function Share() {
  const { current, user } = useAuth(); const qc = useQueryClient(); const fid = current!.id;
  const avail = useQuery({ queryKey: ["foods", fid, "", "available"], queryFn: () => api<Food[]>(`/fridges/${fid}/foods?permission=available`) });
  const reqs = useQuery({ queryKey: ["requests", fid], queryFn: () => api<any[]>(`/fridges/${fid}/requests`), refetchInterval: 15000 });
  const m = useMutation({ mutationFn: (p: { path: string; body?: any }) => api(p.path, { method: "POST", body: p.body }), onSuccess: () => qc.invalidateQueries() });
  const others = (avail.data ?? []).filter((f) => f.owner_id !== user.id);
  return <div className="space-y-6"><h1 className="text-2xl font-bold">Food sharing</h1><ErrorMsg e={m.error} />
    <section><h2 className="mb-2 font-semibold">Available to take</h2>{avail.isLoading ? <Spinner /> : others.length === 0 ? <Empty title="Nothing available right now" hint="When members mark food as Available to take, it shows up here." /> :
      <div className="grid gap-3 sm:grid-cols-2">{others.map((f) => <div key={f.id} className="card !p-4"><div className="flex items-center gap-3"><FoodImage name={f.name} category={f.category} size={44} /><b className="flex-1">{f.name}</b><Badge k={f.status} /></div><p className="text-sm text-stone-600">{f.quantity} {f.unit} from {f.owner} - expires {fmtDate(f.expiry_date)}</p>
        <button className="btn mt-3" disabled={m.isPending} onClick={() => { const q = Number(window.prompt(`How many ${f.unit}? (max ${f.quantity})`, String(f.quantity))); if (q > 0) m.mutate({ path: `/foods/${f.id}/request`, body: { quantity: q } }); }}>Request</button></div>)}</div>}</section>
    <section><h2 className="mb-2 font-semibold">Requests &amp; history</h2>{reqs.isLoading ? <Spinner /> : !reqs.data?.length ? <Empty title="No sharing activity yet" /> : <div className="space-y-2">{reqs.data.map((r) => <div key={r.id} className="card flex flex-wrap items-center justify-between gap-2 !p-4">
      <p className="text-sm">{r.incoming ? <><b>{r.requester}</b> wants</> : "You requested"} {r.quantity} {r.unit} of <b>{r.food}</b> <span className="text-stone-500">- {fmtDate(r.created)}</span></p>
      <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "approved" ? "bg-green-100 text-green-800" : r.status === "pending" ? "bg-orange-100 text-orange-800" : "bg-red-100 text-red-800"}`}>{r.status}</span>
        {r.incoming && r.status === "pending" && <><button className="btn" onClick={() => m.mutate({ path: `/requests/${r.id}/approve` })}>Approve</button><button className="btn-ghost" onClick={() => m.mutate({ path: `/requests/${r.id}/reject` })}>Reject</button></>}</div></div>)}</div>}</section></div>;
}
