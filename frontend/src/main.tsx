import React from "react"; import ReactDOM from "react-dom/client"; import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; import App from "./App"; import { AuthProvider } from "./lib/auth"; import "./index.css"; import { isNative } from "./lib/platform";
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5000 } } });
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><QueryClientProvider client={qc}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider></React.StrictMode>);
if ("serviceWorker" in navigator && import.meta.env.PROD && !isNative) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
