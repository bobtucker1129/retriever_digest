export const metadata = {
  title: 'Retriever Daily Digest',
  description: 'Internal sales motivation tool for BooneGraphics',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
