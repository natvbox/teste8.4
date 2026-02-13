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

  // flags
  isAdmin: boolean; // owner OU admin com tenant
  isOwner: boolean;
  isUser: boolean;
  isTenantAdmin: boolean; // admin com tenant

  login: (params: {
    loginId: string;
    password: string;
    name?: string;
    email?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeMe(data: unknown): UserData | null {
  if (!data || typeof data !== "object") return null;

  // formato { user: ... }
  if ("user" in (data as any)) {
    const u = (data as any).user;
    if (!u || typeof u !== "object") return null;
    if (!("role" in u) || !("openId" in u)) return null;
    return u as UserData;
  }

  // formato user direto
  if ("role" in (data as any) && "openId" in (data as any)) {
    return data as UserData;
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    onError: (err) => {
      // ✅ Se sessão expirar, garante que o app não fique com estado “fantasma”
      if (err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED") {
        utils.auth.me.setData(undefined, undefined);
      }
    },
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
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

      // ✅ garante que o contexto pegue o usuário atual
      await utils.auth.me.refetch();
    },
    [loginMutation, utils.auth.me]
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      // se já está deslogado, não falha UX
      if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
        // ok
      } else {
        throw error;
      }
    } finally {
      // ✅ limpa cache local SEM depender do retorno do servidor
      utils.auth.me.setData(undefined, undefined);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils.auth.me]);

  const refresh = useCallback(async () => {
    await utils.auth.me.refetch();
  }, [utils.auth.me]);

  const userData = normalizeMe(meQuery.data);

  const value = useMemo<AuthContextType>(() => {
    const role = userData?.role;
    const tenantId = userData?.tenantId ?? null;

    const isOwner = role === "owner";
    const isTenantAdmin = role === "admin" && !!tenantId;

    return {
      userData,
      loading:
        meQuery.isLoading ||
        meQuery.isFetching ||
        loginMutation.isPending ||
        logoutMutation.isPending,
      isAuthenticated: Boolean(userData),

      // ✅ admin só se for owner OU admin com tenant
      isAdmin: isOwner || isTenantAdmin,
      isOwner,
      isTenantAdmin,

      isUser: role === "user",

      login,
      logout,
      refresh,
    };
  }, [
    userData,
    meQuery.isLoading,
    meQuery.isFetching,
    loginMutation.isPending,
    logoutMutation.isPending,
    login,
    logout,
    refresh,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
