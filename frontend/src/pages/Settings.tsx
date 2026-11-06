import { useState } from "react"; import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"; import { Download, Trash2 } from "lucide-react"; import { api, download } from "../lib/api"; import { useAuth } from "../lib/auth"; import { ErrorMsg } from "../components/ui"; import { Onboarding } from "./Layout";
export default function Settings() {
  const { user, current, logout } = useAuth(); const qc = useQueryClient(); const admin = current!.role === "admin"; const [more, setMore] = useState(false);
  const mem = useQuery({ queryKey: ["members", current!.id], queryFn: () => api<any[]>(`/fridges/${current!.id}/members`) });
  const m = useMutation({ mutationFn: (p: { path: string; method: string; body?: any }) => api(p.path, { method: p.method, body: p.body }), onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }) });
  return <div className="space-y-4"><h1 className="text-2xl font-bold">Settings</h1>
    <div className="card"><h2 className="font-bold">Profile</h2><p className="text-sm text-stone-600">{user.name} - {user.email}</p></div>
    <div className="card space-y-3"><h2 className="font-bold">{current!.name}</h2><p className="text-sm text-stone-600">Timezone: {current!.timezone} - your role: <b>{current!.role}</b></p>{admin && <p className="text-sm">Invitation code: <code className="rounded bg-stone-100 px-2 py-1 font-bold">{current!.code}</code></p>}
      <ul className="divide-y">{mem.data?.map((x) => <li key={x.id} className="flex items-center justify-between py-2 text-sm"><span>{x.name} <span className="text-stone-500">({x.role})</span></span>
        {admin && x.id !== user.id && <span className="flex gap-2"><button className="btn-ghost" onClick={() => m.mutate({ path: `/fridges/${current!.id}/members/${x.id}`, method: "PATCH", body: { role: x.role === "admin" ? "member" : "admin" } })}>{x.role === "admin" ? "Make member" : "Make admin"}</button>
          <button className="btn-ghost" onClick={() => window.confirm(`Remove ${x.name}?`) && m.mutate({ path: `/fridges/${current!.id}/members/${x.id}`, method: "DELETE" })}>Remove</button></span>}</li>)}</ul><ErrorMsg e={m.error} />
      <button className="btn-ghost" onClick={() => setMore(!more)}>{more ? "Hide" : "Create or join another refrigerator"}</button>{more && <Onboarding />}</div>
    <div className="card space-y-2"><h2 className="font-bold">Privacy &amp; account</h2><p className="text-sm text-stone-600">Download everything we hold about you, or delete your account (your food is removed and your name anonymised).</p>
      <div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={() => download("/me/export", "fridgemate-export.json")}><Download className="h-4 w-4" />Export my data</button>
        <button className="btn-ghost !text-red-700" onClick={async () => { if (window.confirm("Delete your account permanently?")) { await api("/me", { method: "DELETE" }); logout(); } }}><Trash2 className="h-4 w-4" />Delete account</button></div>
      <p className="text-xs text-stone-500">Notification preferences: in-app reminders are always on; per-user preference controls are not built yet.</p></div></div>;
}
