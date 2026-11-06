import { Routes, Route, Navigate } from "react-router-dom";
import { Landing, Forgot, Reset } from "./pages/Landing"; import Layout from "./pages/Layout"; import Dashboard from "./pages/Dashboard"; import Fridge from "./pages/Fridge";
import AddFood from "./pages/AddFood"; import Scan, { PublicScan } from "./pages/Scan"; import Share from "./pages/Share"; import Alerts from "./pages/Alerts"; import Settings from "./pages/Settings"; import FoodDetail from "./pages/FoodDetail";
export default function App() {
  return <Routes>
    <Route path="/" element={<Landing />} /><Route path="/forgot" element={<Forgot />} /><Route path="/reset" element={<Reset />} /><Route path="/q/:token" element={<PublicScan />} />
    <Route path="/app" element={<Layout />}>
      <Route index element={<Dashboard />} /><Route path="fridge" element={<Fridge />} /><Route path="food/:id" element={<FoodDetail />} /><Route path="add" element={<AddFood />} />
      <Route path="scan" element={<Scan />} /><Route path="share" element={<Share />} /><Route path="alerts" element={<Alerts />} /><Route path="settings" element={<Settings />} />
    </Route><Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
