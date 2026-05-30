import { ReactNode, useEffect, useMemo, useState } from "react";
import { AuthContext, type AuthContextValue, type RegisterPayload } from "@/lib/auth-context";
import type { AppUser } from "@/lib/types";
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "@/lib/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const response = await getCurrentUser();
    setUser(response.authenticated ? response.user : null);
  };

  useEffect(() => {
    refreshUser()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    isAdmin: user?.role === "admin",
    login: async (email: string, password: string) => {
      const response = await loginRequest(email, password);
      setUser(response.user);
    },
    register: async (payload: RegisterPayload) => {
      const response = await registerRequest(payload);
      return response.message;
    },
    logout: async () => {
      await logoutRequest();
      setUser(null);
    },
    refreshUser,
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
