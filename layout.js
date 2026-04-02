export const metadata = {
  title: 'Open Ledger — The data speaks. You decide.',
  description: 'Government economic transparency dashboard comparing presidential administrations with raw data.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
