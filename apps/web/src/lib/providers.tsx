import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useState } from "react";
import { builtinClientPluginRegistry } from "@plank/plugin-runtime/client";

interface AppContextValue {
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
  pluginRegistry: typeof builtinClientPluginRegistry;
}

const AppContext = createContext<AppContextValue | null>(null);

function createClients() {
  const convexUrl =
    import.meta.env.VITE_CONVEX_URL ?? import.meta.env.CONVEX_URL;
  if (!convexUrl) {
    throw new Error(
      "Missing Convex URL. Set CONVEX_URL in the repo root .env.local or VITE_CONVEX_URL for the web app.",
    );
  }
  const convexClient = new ConvexReactClient(convexUrl);
  const convexQueryClient = new ConvexQueryClient(convexClient);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 45 * 60_000,
        staleTime: Number.POSITIVE_INFINITY,
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });
  convexQueryClient.connect(queryClient);

  return { convexClient, queryClient };
}

export function PlankProviders({ children }: PropsWithChildren) {
  const [clients] = useState(() => createClients());

  return (
    <ConvexAuthProvider client={clients.convexClient}>
      <QueryClientProvider client={clients.queryClient}>
        <AppContext.Provider
          value={{
            pluginRegistry: builtinClientPluginRegistry,
            convexClient: clients.convexClient,
            queryClient: clients.queryClient,
          }}
        >
          {children}
        </AppContext.Provider>
      </QueryClientProvider>
    </ConvexAuthProvider>
  );
}

export function usePlankApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("usePlankApp must be used inside PlankProviders");
  }
  return context;
}
