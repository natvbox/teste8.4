import React, { createContext, useContext, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

interface AuthContextType {
  userData: any;
  isLoading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userData, setUserData] = useState<any>(null);

  const sessionQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  const loginMutation = trpc.auth.login.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  const isLoading =
    sessionQuery.isLoading ||
    loginMutation.isLoading ||
    logoutMutation.isLoading;

  const isOwner = userData?.role === "owner";
  const isAdmin = userData?.role === "admin";

  useEffect(() => {
    if (sessionQuery.data) {
      setUserData(sessionQuery.data);
    }
  }, [sessionQuery.data]);

  async function login(loginId: string, password: string) {
    const result = await loginMutation.mutateAsync({
      loginId,
      password,
    });

    if (result?.success) {
      await sessionQuery.refetch();
    }
  }

  async function logout() {
    await logoutMutation.mutateAsync();
    setUserData(null);
  }

  async function refetch() {
    await sessionQuery.refetch();
  }

  return (
    <AuthContext.Provider
      value={{
        userData,
        isLoading,
        isOwner,
        isAdmin,
        login,
        logout,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro do AuthProvider");
  }
  return ctx;
}
