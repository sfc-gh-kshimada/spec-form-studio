import type { Metadata } from "next"
import type React from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/components/query-provider"
import { APP_TITLE, LOGO_SRC } from "@/lib/constants"
import "./globals.css"

export const metadata: Metadata = {
  title: APP_TITLE,
  description: "原本確認・マスター確定・様式レビュー",
  icons: { icon: LOGO_SRC },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
