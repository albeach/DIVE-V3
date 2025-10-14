import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { LogoutListener } from "@/components/providers/logout-listener";
import { TokenExpiryChecker } from "@/components/auth/token-expiry-checker";
import { SessionErrorBoundary } from "@/components/auth/session-error-boundary";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DIVE V3 - Coalition ICAM Pilot",
  description: "USA/NATO Coalition Identity and Access Management Demonstration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${robotoMono.variable} antialiased`}
      >
        <SessionErrorBoundary>
          <Providers>
            <TokenExpiryChecker />
            <LogoutListener>
              {children}
            </LogoutListener>
          </Providers>
        </SessionErrorBoundary>
      </body>
    </html>
  );
}

