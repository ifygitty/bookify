import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import Navbar from "@/components/Navbar";
import ThemeProvider from "@/components/ThemeProvider";
import DialogProvider from "@/components/dialogs/DialogProvider";
import AccountProvider from "@/components/AccountProvider";
import "./globals.css";
import {Toaster} from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://elio.study"),
  title: {
    default: "Elio | Your AI study companion",
    template: "%s | Elio",
  },
  description: "Bring your course materials together, learn with AI, practise with personalised questions and prepare for exams with confidence.",
  applicationName: "Elio",
  openGraph: {
    type: "website",
    siteName: "Elio",
    title: "Elio | Your AI study companion",
    description: "Everything you need to master your studies.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Elio | Your AI study companion",
    description: "Everything you need to master your studies.",
  },
  icons: {
    icon: "/assets/mainlogo-mark.svg",
    apple: "/assets/mainlogo-mark.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#071b14" },
    { media: "(prefers-color-scheme: light)", color: "#f5fbf6" },
  ],
};

const clerkAppearance = {
  layout: {
    logoImageUrl: "/assets/Mainlogo.png",
  },
  variables: {
    colorPrimary: "var(--gold)",
    colorBackground: "var(--navy-700)",
    colorText: "var(--ink)",
    colorTextSecondary: "var(--ink-soft)",
    colorTextOnPrimaryBackground: "var(--navy-900)",
    colorInputBackground: "var(--navy-inset)",
    colorInputText: "var(--ink)",
    colorNeutral: "var(--ink)",
    colorDanger: "#f87171",
    colorSuccess: "#34d399",
    colorWarning: "#fbbf24",
    borderRadius: "0.75rem",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/courses"
      signUpFallbackRedirectUrl="/courses"
    >
        <html lang="en" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
          <body
            className="relative font-sans antialiased"
          >
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
              <DialogProvider>
                <AccountProvider>
                  <Navbar />
                  {children}
                  <Toaster />
                </AccountProvider>
              </DialogProvider>
            </ThemeProvider>
          </body>
        </html>
    </ClerkProvider>
  );
}


 
