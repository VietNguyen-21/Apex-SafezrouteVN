import { Navigate, Route, Routes } from "react-router-dom";
import { AdminPage } from "../admin/AdminPage";
import { DriverPage } from "../driver/DriverPage";
import type { DispatchApi } from "../services/api/DispatchApi";
import { DispatchProvider } from "./DispatchContext";

export function App({ api }: { api?: DispatchApi }) {
  return (
    <DispatchProvider api={api}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/driver" element={<DriverPage />} />
        <Route path="*" element={<Navigate replace to="/admin" />} />
      </Routes>
    </DispatchProvider>
  );
}
