import { useState } from "react"; import { NavLink, Navigate, Outlet } from "react-router-dom"; import { LayoutDashboard, Snowflake, Plus, ScanLine, Share2, Bell, Settings as Cog, LogOut } from "lucide-react";
import { api } from "../lib/api"; import { useAuth } from "../lib/auth"; import { Spinner, ErrorMsg } from "../components/ui";
const nav = [["/app", "Dashboard", LayoutDashboard, true], ["/app/fridge", "Fridge", Snowflake, false], ["/app/add", "Add food", Plus, false], ["/app/scan", "Scan", ScanLine, false], ["/app/share", "Sharing", Share2, false], ["/app/alerts", "Alerts", Bell, false], ["/app/settings", "Settings", Cog, false]] as const;
export function Onboarding() {
  const { refresh, setFridgeId } = useAuth(); const [name, setName] = useState(""); const [code, setCode] = useState(""); const [err, setErr] = useState<any>(null);
  const go = async (path: string, body: any) => { try { setErr(null); const r = await api(path, { method: "POST", body }); setFridgeId(r.id); refresh(); } catch (e) { setErr(e); } };
  return <div className="mx-auto max-w-md space-y-4 p-4"><div className="card space-y-2"><h2 className="font-bold">Create a refrigerator</h2><label className="label" htmlFor="rn">Name</label><input id="rn" className="input" placeholder="e.g. Hostel Fridge" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" onClick={() => go("/fridges", { name })}>Create</button></div>
    <div className="card space-y-2"><h2 className="font-bold">Join with an invitation code</h2><label className="label" htmlFor="jc">Code</label><input id="jc" className="input" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn" onClick={() => go("/fridges/join", { code })}>Join</button></div><ErrorMsg e={err} /></div>;
}
export default function Layout() {
  const { token, user, fridges, current, setFridgeId, logout, loading, netError, retry } = useAuth();
  if (!token) return <Navigate to="/" replace />; if (loading) return <Spinner />;
  if (netError) return <div className="mx-auto max-w-md p-6"><div className="card space-y-3" role="alert"><p className="font-semibold">Can't reach the FridgeMate server</p><p className="text-sm text-stone-600">Check your internet connection and try again. Your login is kept.</p><button className="btn w-full" onClick={retry}>Try again</button><button className="btn-ghost w-full" onClick={logout}>Log out</button></div></div>;
  if (!current) return <Onboarding />;
  const link = (to: string, label: string, I: any, end: boolean, mobile = false) => <NavLink key={to} to={to} end={end} className={({ isActive }) => mobile ? `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? "font-bold text-brand-600" : "text-stone-500"}` : `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-stone-600 hover:bg-stone-100"}`}><I className={mobile ? "h-5 w-5" : "h-4 w-4"} />{label}</NavLink>;
  return <div className="min-h-screen md:flex">
    <aside className="hidden w-64 shrink-0 flex-col border-r border-stone-200 bg-white p-4 md:flex"><div className="mb-5 flex items-center gap-2 px-2"><Snowflake className="h-6 w-6 text-brand-600" /><span className="text-lg font-extrabold">Fridge<span className="text-brand-600">Mate</span></span></div>
      <label className="sr-only" htmlFor="fsel">Refrigerator</label><select id="fsel" className="input mb-4" value={current.id} onChange={(e) => setFridgeId(+e.target.value)}>{fridges.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <nav className="space-y-1">{nav.map(([t, l, I, e]) => link(t, l, I, e))}</nav>
      <div className="mt-auto border-t pt-3 text-sm"><p className="px-2 font-medium">{user?.name}</p><button className="btn-ghost mt-2 w-full" onClick={logout}><LogOut className="h-4 w-4" />Log out</button></div></aside>
    <div className="flex-1 pb-20 md:pb-0">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:hidden"><select aria-label="Refrigerator" className="input !w-auto" value={current.id} onChange={(e) => setFridgeId(+e.target.value)}>{fridges.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <div className="flex gap-1"><NavLink to="/app/alerts" aria-label="Alerts" className="btn-ghost !p-2"><Bell className="h-4 w-4" /></NavLink><NavLink to="/app/settings" aria-label="Settings" className="btn-ghost !p-2"><Cog className="h-4 w-4" /></NavLink></div></header>
      <main className="mx-auto max-w-5xl p-4 md:p-8"><Outlet /></main></div>
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-white md:hidden">{nav.slice(0, 5).map(([t, l, I, e]) => link(t, l, I, e, true))}</nav></div>;
}
