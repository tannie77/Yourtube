    import Header from "@/components/header";
    import Sidebar from "@/components/Sidebar";
    import { Toaster} from "@/components/ui/sonner";
    import "@/styles/globals.css";
    import type { AppProps } from "next/app";
    import {UserProvider} from "@/lib/AuthContent";

    export default function App({ Component, pageProps }: AppProps) {
    return (
        <UserProvider>
            <div className="min-h-screen bg-white text-black">
                <Header />
                    <Toaster />
                    <div className="flex">
                        <Sidebar />
                        <Component {...pageProps} />
                    </div>
            </div>
        </UserProvider>
    );
}