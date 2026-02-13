import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./contexts/AuthContext";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Groups from "./pages/Groups";
import Notifications from "./pages/Notifications";
import Schedule from "./pages/Schedule";
import History from "./pages/History";
import Logs from "./pages/Logs";
import UserNotifications from "./pages/UserNotifications";
import Subscription from "./pages/Subscription";
import SuperAdmin from "./pages/SuperAdmin";

function ProtectedRoute({
  component: Component,
  requireOwner = false,
  requireAdmin = false,
  requireUser = false,
}: {
  component: React.ComponentType;
  requireOwner?: boolean;
  requireAdmin?: boolean;
  requireUser?: boolean;
}) {
  const { loading, isAuthenticated, userData, isOwner, isAdmin, isUser } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated || !userData) {
    return <Redirect to="/login" />;
  }

  if (requireOwner && !isOwner) return <Redirect to="/dashboard" />;

  // ✅ usa flag do contexto (admin precisa ter tenant; owner passa)
  if (requireAdmin && !isAdmin) return <Redirect to="/my-notifications" />;

  if (requireUser && !isUser) return <Redirect to="/dashboard" />;

  return <Component />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Switch>
            <Route path="/login" component={Login} />

            {/* USER */}
            <Route
              path="/my-notifications"
              component={() => <ProtectedRoute component={UserNotifications} requireUser />}
            />

            {/* ADMIN */}
            <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} requireAdmin />} />
            <Route path="/users" component={() => <ProtectedRoute component={Users} requireAdmin />} />
            <Route path="/groups" component={() => <ProtectedRoute component={Groups} requireAdmin />} />
            <Route
              path="/notifications"
              component={() => <ProtectedRoute component={Notifications} requireAdmin />}
            />
            <Route path="/schedule" component={() => <ProtectedRoute component={Schedule} requireAdmin />} />
            <Route path="/history" component={() => <ProtectedRoute component={History} requireAdmin />} />
            <Route path="/logs" component={() => <ProtectedRoute component={Logs} requireAdmin />} />

            {/* Subscription é owner-only na sidebar, mas a rota pode ser admin também se quiser.
                Se quiser travar só owner, troque requireAdmin por requireOwner. */}
            <Route
              path="/subscription"
              component={() => <ProtectedRoute component={Subscription} requireAdmin />}
            />

            {/* OWNER */}
            <Route path="/superadmin" component={() => <ProtectedRoute component={SuperAdmin} requireOwner />} />

            {/* Root redirect */}
            <Route path="/" component={() => <Redirect to="/login" />} />

            <Route component={NotFound} />
          </Switch>

          <Toaster richColors />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
