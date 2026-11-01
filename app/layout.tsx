import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import Navbar from "@/components/Navbar";
import "./globals.css";
import {Toaster} from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mentor",
  description: "Your personal AI study companion for understanding course materials, practicing, and staying on track.",
  applicationName: "Mentor",
  icons: {
    icon: "/assets/mainlogo-mark.svg",
    apple: "/assets/mainlogo-mark.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071426",
  colorScheme: "dark",
};

const clerkAppearance = {
  layout: {
    logoImageUrl: "/assets/Mainlogo.png",
  },
  variables: {
    colorPrimary: "#D4AF37",
    colorBackground: "#102440",
    colorText: "#F4F6FA",
    colorTextSecondary: "#A8B4C7",
    colorTextOnPrimaryBackground: "#071426",
    colorInputBackground: "#0B1B32",
    colorInputText: "#F4F6FA",
    colorNeutral: "#F4F6FA",
    colorDanger: "#F87171",
    colorSuccess: "#34D399",
    colorWarning: "#FBBF24",
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
        <html lang="en" className={`dark ${inter.variable}`}>
          <body
            className="relative font-sans antialiased"
          >
            <Navbar />
            {children}
            <Toaster />
          </body>
        </html>
    </ClerkProvider>
  );
}


 
