// App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import { RequireAdmin, RequireAuth, RedirectByRole } from "./auth/RouteGuards";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RedirectByRole />} />
        <Route path="/home" element={<Home />} />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <Chat />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
