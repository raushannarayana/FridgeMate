import { createContext, useContext, useState, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, tokenStore, Fridge } from "./api";
type Ctx = { token: string | null; user: any; fridges: Fridge[]; current: Fridge | null; loading: boolean; netError: boolean; retry: () => void; setFridgeId: (id: number) => void; signIn: (t: string) => void; logout: () => void; refresh: () => void };
const C = createContext<Ctx>(null as any); export const useAuth = () => useContext(C);
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient(); const [token, setToken] = useState(tokenStore.get()); const [fid, setFid] = useState<number | null>(Number(localStorage.getItem("fm_fridge")) || null);
  const me = useQuery({ queryKey: ["me", token], queryFn: () => api("/me"), enabled: !!token, retry: false });
  const fr = useQuery({ queryKey: ["fridges", token], queryFn: () => api<Fridge[]>("/fridges"), enabled: !!token && !!me.data });
  const logout = () => { tokenStore.clear(); setToken(null); qc.clear(); };
  const rejected = me.isError && [401, 403, 404].includes((me.error as { status?: number })?.status ?? -1); // server says the login is no longer valid
  if (rejected && token) logout();
  const netError = !!token && !rejected && (me.isError || fr.isError); // offline / server down: keep the saved login, let the person retry
  const fridges = fr.data ?? []; const current = fridges.find((f) => f.id === fid) ?? fridges[0] ?? null;
  return <C.Provider value={{ token, user: me.data, fridges, current, loading: !!token && (me.isLoading || fr.isLoading), netError, retry: () => { me.refetch(); fr.refetch(); },
    setFridgeId: (id) => { localStorage.setItem("fm_fridge", String(id)); setFid(id); }, signIn: (t) => { tokenStore.set(t); setToken(t); }, logout,
    refresh: () => qc.invalidateQueries({ queryKey: ["fridges"] }) }}>{children}</C.Provider>;
}
