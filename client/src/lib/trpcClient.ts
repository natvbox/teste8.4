import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import { trpc } from "./trpc";

export const queryClient = new QueryClient();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include", // 🔴 ESSENCIAL
        });
      },
    }),
  ],
});
