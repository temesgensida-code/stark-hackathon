// Root layout: mounts <BrailleProvider> and the Voxide voice widget so both survive page changes.
// TODO: not implemented yet. See docs/architecture.md.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
