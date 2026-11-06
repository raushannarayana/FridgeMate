import { useQuery } from "@tanstack/react-query"; import { Bell } from "lucide-react"; import { api } from "../lib/api"; import { Empty, Spinner } from "../components/ui";
export default function Alerts() {
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ text: string; time: string }[]>("/notifications"), refetchInterval: 30000 });
  const perm = typeof Notification !== "undefined" ? Notification.permission : "denied";
  return <div className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Notifications</h1>
    {perm === "default" && <button className="btn-ghost" onClick={() => Notification.requestPermission().then((p) => p === "granted" && new Notification("FridgeMate", { body: "Browser notifications enabled" }))}><Bell className="h-4 w-4" />Enable browser alerts</button>}</div>
    {q.isLoading ? <Spinner /> : !q.data?.length ? <Empty title="You're all caught up" hint="Expiry reminders and sharing updates appear here." /> : <ul className="space-y-2">{q.data.map((n, i) => <li key={i} className="card !p-4"><p>{n.text}</p><p className="text-xs text-stone-500">{new Date(n.time + "Z").toLocaleString()}</p></li>)}</ul>}</div>;
}
