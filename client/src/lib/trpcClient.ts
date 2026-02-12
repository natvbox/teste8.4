import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import { trpc } from "./trpc";

// ==============================
// Query Client
// ==============================
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ==============================
// Resolver URL da API
// ==============================

function getBaseUrl() {
  // Se definido no .env do frontend (opcional)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Produção (mesmo domínio)
  if (typeof window !== "undefined") {
    return "";
  }

  // Fallback (SSR / Node)
  return "http://localhost:10000";
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include", // 🔴 ESSENCIAL PARA COOKIE
        });
      },
    }),
  ],
});

