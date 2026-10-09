import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Buyer Correction Tracker", description: "Review prospect corrections and affected follow-ups." };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
