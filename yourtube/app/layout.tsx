import AppShell from "@/components/app-shell";
import { UserProvider } from "@/lib/AuthContent";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VidCircle",
  description: "Local video platform prototype",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <UserProvider>
          <AppShell>
            {children}
          </AppShell>
        </UserProvider>
      </body>
    </html>
  );
}
