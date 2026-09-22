import Header from "@/components/header";
import Sidebar from "@/components/Sidebar";
import { UserProvider } from "@/lib/AuthContent";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Youtube Clone",
  description: "Youtube Clone App",
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
          <Header />
          <div className="flex min-h-[calc(100vh-57px)]">
            <Sidebar />
            {children}
          </div>
        </UserProvider>
</body>
    </html>
  );
}
