import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { Footer } from "@/components/layout/Footer";

const styreneA = localFont({
  src: [
    {
      path: '../public/fonts/StyreneA-Thin.otf',
      weight: '100',
      style: 'normal',
    },
    {
      path: '../public/fonts/StyreneA-ThinItalic.otf',
      weight: '100',
      style: 'italic',
    },
    {
      path: '../public/fonts/StyreneA-Light.otf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../public/fonts/StyreneA-LightItalic.otf',
      weight: '300',
      style: 'italic',
    },
    {
      path: '../public/fonts/StyreneA-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/StyreneA-RegularItalic.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../public/fonts/StyreneA-Medium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../public/fonts/StyreneA-MediumItalic.otf',
      weight: '500',
      style: 'italic',
    },
    {
      path: '../public/fonts/StyreneA-Bold.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../public/fonts/StyreneA-BoldItalic.otf',
      weight: '700',
      style: 'italic',
    },
    {
      path: '../public/fonts/StyreneA-Black.otf',
      weight: '900',
      style: 'normal',
    },
    {
      path: '../public/fonts/StyreneA-BlackItalic.otf',
      weight: '900',
      style: 'italic',
    },
  ],
  variable: '--font-styrene',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Hedera AI Studio",
  description: "Build and deploy AI agents on Hedera - OpenConvAI, ElizaOS, MCP Server Tools",
};

/**
 * Root layout component that wraps the entire application
 * Provides global styling, font configuration, and authentication context
 * @param {Object} props - Layout props
 * @param {React.ReactNode} props.children - Child components to render within the layout
 * @returns {JSX.Element} The root HTML structure with authentication provider
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${styreneA.variable} antialiased min-h-screen flex flex-col bg-background text-foreground`}>
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            {children}
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
