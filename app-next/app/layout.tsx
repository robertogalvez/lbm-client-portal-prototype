import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LBM Portal",
  description: "Legacy Building Media — Internal Operations Portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
