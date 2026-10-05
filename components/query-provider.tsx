"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true, gcTime: 60_000 }, mutations: { retry: false } } }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
