import React, { createContext, useCallback, useContext, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";

export type UserRole = "user" | "admin" | "owner";

export interface UserData {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  tenantId: number | null;
}

interface AuthContextType {
  userData: UserData | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isUser: boolean;
  login: (params: { loginId: string; password: string; name?: string; email?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null as any);
    },
  });

  const login = useCallback(
    async ({
      loginId,
      password,
      name,
      email,
    }: {
      loginId: string;
      password: string;
      name?: string;
      email?: string;
    }) => {
      const openId = loginId.trim().toLowerCase();

      await loginMutation.mutateAsync({
        loginId: openId,
        password,
        name: name?.trim() || undefined,
        email: email?.trim().toLowerCase() || undefined,
      });

      // garante atualização imediata do estado após login
      await utils.auth.me.invalidate();
      await utils.auth.me.refetch();
    },
    [loginMutation, utils.auth.me]
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
        // já deslogado
      } else {
        throw error;
      }
    } finally {
      utils.auth.me.setData(undefined, null as any);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils.auth.me]);

  const refresh = useCallback(async () => {
    await meQuery.refetch();
  }, [meQuery]);

  // ✅ NORMALIZAÇÃO DO RETORNO DO auth.me:
  // - se vier { user: ... }, usa data.user
  // - se vier o user direto, usa data
  const rawMe: any = meQuery.data;
  const userData: UserData | null =
    rawMe && typeof rawMe === "object" && "user" in rawMe ? (rawMe.user as UserData | null) : ((rawMe ?? null) as UserData | null);

  const value = useMemo<AuthContextType>(() => {
    const role = userData?.role;
    return {
      userData,
      loading: meQuery.isLoading || loginMutation.isPending || logoutMutation.isPending,
      isAuthenticated: Boolean(userData),
      isAdmin: role === "admin" || role === "owner",
      isOwner: role === "owner",
      isUser: role === "user",
      login,
      logout,
      refresh,
    };
  }, [userData, meQuery.isLoading, loginMutation.isPending, logoutMutation.isPending, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
