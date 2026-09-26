import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aditi Garden: The Living Map",
  description:
    "Explore Aditi Garden in 3D, discover its wild neighbours, and collect four habitat songs with Mitra the bee.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
