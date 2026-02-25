import "./globals.css";

export const metadata = {
  title: "Vowel Core — Self-hosted Token Service",
  description:
    "Self-hosted token service for sndbrd, OpenAI Realtime, and Grok Realtime.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
