import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

/**
 * Hook principal do tRPC para React
 * Usado em todo o frontend.
 *
 * Ex:
 * const { data } = trpc.notifications.list.useQuery(...)
 */
export const trpc = createTRPCReact<AppRouter>();

