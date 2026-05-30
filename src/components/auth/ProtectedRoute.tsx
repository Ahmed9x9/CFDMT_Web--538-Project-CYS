import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/useAuth";

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Checking session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function AdminRoute({ children }: { children: JSX.Element }) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Checking session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
