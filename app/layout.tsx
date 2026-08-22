import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Vote Unbiased — The Economy Under Every President, In Data',
  description: 'Official broadcasts fact-checked live against BLS, BEA, Census and Fed data. Every claim shows the quote, the real figure and the source. No spin. You interpret.',
  metadataBase: new URL('https://voteunbiased.org'),
  verification: {
    google: 'o9EM5aUToekdkqIelamubG94gJfUyFp9si6LfrhZd2M',
  },
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: '16x16 32x32',
      },
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'Vote Unbiased — The Economy Under Every President, In Data',
    description: 'Official broadcasts fact-checked live against BLS, BEA, Census and Fed data. Every claim shows the quote, the real figure and the source. No spin. You interpret.',
    url: 'https://voteunbiased.org',
    siteName: 'Vote Unbiased',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vote Unbiased — The Economy Under Every President, In Data',
    description: 'Official broadcasts fact-checked live against BLS, BEA, Census and Fed data. Every claim shows the quote, the real figure and the source. No spin. You interpret.',
  },
}

// maximumScale: 1 stops iOS Safari's automatic zoom-in when focusing an
// input whose font-size is under 16px — the zoom never reverses on blur,
// leaving the whole page clipped ~20% on the right (observed on /live).
// Since iOS 10, Safari still allows manual pinch-zoom regardless of this
// setting, so accessibility zoom is unaffected.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        {/* Fonts loaded ONCE at the document level with early preconnects.
            Previously /live injected a CSS @import inside a client component
            — the browser only discovered the font stylesheet AFTER JS
            hydration, delaying text render on every visit — and /dashboard
            carried its own duplicate <link>. One request, discovered in the
            initial HTML, shared by both pages. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600;8..60,700;8..60,900&family=DM+Sans:wght@400;500;600;700;800;900&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <Script async src="https://www.googletagmanager.com/gtag/js?id=AW-16681848292" strategy="afterInteractive" />
        <Script id="google-ads" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-16681848292');
          `}
        </Script>
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "wbcexmfdix");
          `}
        </Script>
      </head>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
