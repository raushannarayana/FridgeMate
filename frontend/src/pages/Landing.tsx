import { useState } from "react"; import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"; import { useForm } from "react-hook-form"; import { z } from "zod"; import { zodResolver } from "@hookform/resolvers/zod";
import { QrCode, Radio, Share2, Bell, BarChart3, Leaf, Snowflake } from "lucide-react"; import { useQuery } from "@tanstack/react-query"; import { api } from "../lib/api"; import { useAuth } from "../lib/auth"; import { ErrorMsg } from "../components/ui";
const schema = z.object({ name: z.string().optional(), email: z.string().email("Enter a valid email"), password: z.string().min(8, "At least 8 characters") });
function AuthCard() {
  const { signIn } = useAuth(); const nav = useNavigate(); const [mode, setMode] = useState<"quick" | "login" | "register">("quick"); const [err, setErr] = useState<any>(null); const [busy, setBusy] = useState(false); const [guest, setGuest] = useState("");
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => api<{ quick_login?: boolean }>("/config") }); const quickOk = cfg.data?.quick_login !== false; const m = quickOk ? mode : mode === "quick" ? "login" : mode;
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const go = async (path: string, body: unknown) => { setBusy(true); setErr(null); try { const r = await api(path, { method: "POST", body }); signIn(r.token); nav("/app"); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const submit = handleSubmit((v) => { if (m === "register" && !v.name?.trim()) return setErr(new Error("Please enter your name")); return go(`/auth/${m}`, v); });
  if (m === "quick") return <form onSubmit={(e) => { e.preventDefault(); if (!guest.trim()) return setErr(new Error("Please type your name")); go("/auth/quick", { name: guest }); }} className="card w-full max-w-md space-y-3" aria-label="Sign in with your name">
    <h2 className="text-xl font-bold">Welcome! What's your name?</h2>
    <p className="text-sm text-stone-600">Just type your name to start. You'll join the shared fridge automatically, and the same name brings you back to your items.</p>
    <div><label className="label" htmlFor="guest">Your name</label><input id="guest" className="input" placeholder="e.g. Riya" maxLength={40} autoFocus autoComplete="given-name" value={guest} onChange={(e) => setGuest(e.target.value)} /></div>
    <ErrorMsg e={err} /><button className="btn w-full" disabled={busy}>{busy ? "Please wait..." : "Continue"}</button>
    <p className="text-xs text-stone-500">Anyone who types the same name opens the same profile, so pick a name only you use. For a private account, use email &amp; password.</p>
    <div className="flex justify-between text-sm"><button type="button" className="text-brand-700 underline" onClick={() => { setErr(null); setMode("login"); }}>Log in with email</button><button type="button" className="text-brand-700 underline" onClick={() => { setErr(null); setMode("register"); }}>Create an email account</button></div></form>;
  return <form onSubmit={submit} className="card w-full max-w-md space-y-3" aria-label={m}>
    <h2 className="text-xl font-bold">{m === "login" ? "Welcome back" : "Create your account"}</h2>
    {m === "register" && <div><label className="label" htmlFor="name">Name</label><input id="name" className="input" {...register("name")} /></div>}
    <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" {...register("email")} />{errors.email && <p className="err">{errors.email.message}</p>}</div>
    <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" className="input" {...register("password")} />{errors.password && <p className="err">{errors.password.message}</p>}</div>
    <ErrorMsg e={err} /><button className="btn w-full" disabled={busy}>{busy ? "Please wait..." : m === "login" ? "Log in" : "Register"}</button>
    <div className="flex justify-between text-sm"><button type="button" className="text-brand-700 underline" onClick={() => { setErr(null); setMode(m === "login" ? "register" : "login"); }}>{m === "login" ? "New here? Register" : "Have an account? Log in"}</button><Link className="text-stone-500 underline" to="/forgot">Forgot password?</Link></div>
    {quickOk && <button type="button" className="w-full text-sm text-brand-700 underline" onClick={() => { setErr(null); setMode("quick"); }}>Back: continue with just my name</button>}</form>;
}
const features = [[QrCode, "QR food identity", "Every item gets a secure, printable QR label. Scan it to see who owns it and when it expires."], [Radio, "Optional NFC tags", "Add a tap-to-open NFC sticker as a second way to identify food (Android Chrome to write)."],
  [Share2, "Share, don't waste", "Mark food Available to take. Members request, owners approve, quantities update safely."], [Bell, "Expiry reminders", "3-day, 1-day and expiry-day alerts, and a Consume First list that explains why."], [BarChart3, "Waste analytics", "Real charts from your own fridge records: consumed vs expired, categories, contributions."], [Leaf, "Privacy first", "Personal food stays private. Public scans reveal almost nothing."]] as const;
export function Landing() {
  const { token } = useAuth(); if (token) return <Navigate to="/app" replace />;
  return <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
    <header className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-5"><Snowflake className="h-6 w-6 text-brand-600" /><span className="text-xl font-extrabold tracking-tight">Fridge<span className="text-brand-600">Mate</span></span></header>
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-2">
      <div><span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">Built for hostels, PGs, flats, offices &amp; families</span>
        <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">Your Shared Fridge. <span className="text-brand-600">Smarter, Cleaner, Waste-Free.</span></h1>
        <p className="mt-4 max-w-lg text-lg text-stone-600">Know whose food is whose, never miss an expiry date, and share what you can't finish. QR-first, with optional NFC tap labels.</p>
        <div className="mt-6 grid max-w-md grid-cols-3 gap-3 text-center text-sm">{["Scan the QR", "See the owner", "Share or consume"].map((s, i) => <div key={s} className="rounded-2xl bg-white p-3 shadow-sm"><div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{i + 1}</div>{s}</div>)}</div></div>
      <div className="flex justify-center"><AuthCard /></div></section>
    <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 sm:grid-cols-2 lg:grid-cols-3">{features.map(([I, t, d]) => <div key={t} className="card"><I className="h-6 w-6 text-brand-600" /><h3 className="mt-3 font-bold">{t}</h3><p className="mt-1 text-sm text-stone-600">{d}</p></div>)}</section>
    <footer className="pb-8 text-center text-xs text-stone-500">FridgeMate never guarantees food safety from a date alone - use your own judgement.</footer></div>;
}
export function Forgot() {
  const [sent, setSent] = useState(false); const [email, setEmail] = useState(""); const [err, setErr] = useState<any>(null);
  return <div className="flex min-h-screen items-center justify-center p-4"><form className="card w-full max-w-md space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await api("/auth/forgot", { method: "POST", body: { email } }); setSent(true); } catch (x) { setErr(x); } }}>
    <h1 className="text-xl font-bold">Reset password</h1>{sent ? <p>If that email exists, a reset link has been sent. (In development the link is printed in the server console.)</p> : <>
      <label className="label" htmlFor="fe">Email</label><input id="fe" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /><ErrorMsg e={err} /><button className="btn w-full">Send reset link</button></>}
    <Link to="/" className="block text-sm text-brand-700 underline">Back to login</Link></form></div>;
}
export function Reset() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const [pw, setPw] = useState(""); const [err, setErr] = useState<any>(null);
  return <div className="flex min-h-screen items-center justify-center p-4"><form className="card w-full max-w-md space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await api("/auth/reset", { method: "POST", body: { token: sp.get("token"), password: pw } }); nav("/"); } catch (x) { setErr(x); } }}>
    <h1 className="text-xl font-bold">Choose a new password</h1><label className="label" htmlFor="np">New password</label><input id="np" type="password" minLength={8} required className="input" value={pw} onChange={(e) => setPw(e.target.value)} /><ErrorMsg e={err} /><button className="btn w-full">Save password</button></form></div>;
}
