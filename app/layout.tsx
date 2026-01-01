import "./globals.css";

export const metadata = {
  title: "Kelvin YouTube Short Channel Finder",
  description: "Find viral YouTube Shorts channels before trends explode",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
