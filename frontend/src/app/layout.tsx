import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { LogoutListener } from "@/components/providers/logout-listener";
import { TokenExpiryChecker } from "@/components/auth/token-expiry-checker";
import { SessionErrorBoundary } from "@/components/auth/session-error-boundary";

/**
 * ✅ SECURITY: Using system fonts instead of Google Fonts CDN
 * No external dependencies for secure/air-gapped environments
 * System font stacks provide excellent cross-platform support
 */

export const metadata: Metadata = {
  // Primary Metadata
  title: {
    default: "DIVE V3 - Coalition ICAM Platform",
    template: "%s | DIVE V3"
  },
  description: "Secure Coalition Identity & Access Management for USA/NATO partners. Federated authentication with attribute-based authorization (ABAC) and policy-driven security.",
  
  // Keywords for SEO
  keywords: [
    "coalition ICAM",
    "federated identity",
    "NATO authentication",
    "ABAC authorization",
    "defense security",
    "Keycloak",
    "zero trust",
    "multi-factor authentication",
    "clearance-based access"
  ],
  
  // Authors & Creator
  authors: [{ name: "DIVE V3 Team" }],
  creator: "DIVE V3 Coalition Project",
  publisher: "Defense Innovation",
  
  // Verification & Ownership
  robots: {
    index: false, // Development site - don't index
    follow: false,
    nocache: true,
  },
  
  // Open Graph (Facebook, LinkedIn, etc.)
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://dev-app.dive25.com",
    siteName: "DIVE V3 Coalition ICAM",
    title: "DIVE V3 - Coalition Identity & Access Management",
    description: "Secure federated authentication and authorization for USA/NATO coalition partners. Experience next-generation defense identity management.",
    images: [
      {
        url: "https://dev-app.dive25.com/DIVE-Logo.png",
        width: 1200,
        height: 630,
        alt: "DIVE V3 Coalition ICAM Platform Logo",
        type: "image/png",
      },
    ],
  },
  
  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "DIVE V3 - Coalition ICAM Platform",
    description: "Secure federated authentication for USA/NATO partners with ABAC authorization and policy-driven security.",
    images: ["https://dev-app.dive25.com/DIVE-Logo.png"],
    creator: "@DIVEV3",
    site: "@DIVEV3",
  },
  
  // Icons & Manifest
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/DIVE-Logo.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/DIVE-Logo.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  
  // App Manifest (PWA support)
  manifest: "/manifest.json",
  
  // Additional Metadata
  category: "Security & Defense",
  applicationName: "DIVE V3 Coalition ICAM",
  
  // Referrer Policy (security best practice)
  referrer: "origin-when-cross-origin",
  
  // Format Detection (disable for phone numbers)
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  
  // Alternative Languages (if supported)
  alternates: {
    canonical: "https://dev-app.dive25.com",
    languages: {
      "en-US": "https://dev-app.dive25.com",
      "fr-FR": "https://dev-app.dive25.com/fr",
    },
  },
};

// Viewport configuration (Next.js 15 - separate from metadata)
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e40af" },
    { media: "(prefers-color-scheme: dark)", color: "#1e3a8a" },
  ],
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
        className="antialiased"
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

