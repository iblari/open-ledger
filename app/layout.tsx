import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import './globals.css'
import { headers } from 'next/headers'
import { ViewportProvider } from '@/lib/viewport'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Vote Unbiased — Political & Economic Intelligence',
  description: 'The economy under every president, in data — and live fact-checks of what politicians say, against BLS, BEA, Census and Fed figures. No spin.',
  metadataBase: new URL('https://voteunbiased.org'),
  // Saved to the home screen, the site opens without any browser bars — the
  // only way an iPhone gives a web page the whole screen.
  appleWebApp: { capable: true, title: 'Vote Unbiased', statusBarStyle: 'black-translucent' },
  verification: {
    google: 'o9EM5aUToekdkqIelamubG94gJfUyFp9si6LfrhZd2M',
  },
  // ?v=4: browsers (Safari especially) key their favicon cache by URL, so
  // a new query string is what actually makes returning visitors refetch.
  icons: {
    icon: [
      {
        url: '/favicon.ico?v=4',
        sizes: '16x16 32x32',
      },
      {
        url: '/icon-light-32x32.png?v=4',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png?v=4',
        media: '(prefers-color-scheme: dark)',
      },
      // 192px PNG for Google Search: it wants a square icon that's a
      // multiple of 48px, and shows it in a circle, so this version is drawn
      // smaller to keep the head and paws inside the crop.
      {
        url: '/icon-192.png?v=4',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon.svg?v=4',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png?v=4',
  },
  // Short on purpose: iMessage and Slack print this under the image, and a
  // title-cased sentence there read like a spam headline. The image carries
  // the message.
  openGraph: {
    title: 'Vote Unbiased',
    description: 'Political & economic intelligence. The economy under every president, in data — and live fact-checks of what politicians say.',
    url: 'https://voteunbiased.org',
    siteName: 'Vote Unbiased',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vote Unbiased — Political & economic intelligence',
    description: 'The economy under every president, in data — and live fact-checks of what politicians say. No spin.',
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
  // Draw edge to edge, including beside the camera notch when a phone is
  // held sideways; layouts pad themselves with env(safe-area-inset-*).
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Phone or not, decided from the request so the first HTML is already the
  // right layout (lib/viewport.tsx). Client Hint first, User-Agent fallback;
  // iPads report a desktop UA and correctly get the desktop layout.
  const h = await headers()
  const chMobile = h.get('sec-ch-ua-mobile')
  const ua = h.get('user-agent') || ''
  const mobile = chMobile ? chMobile.includes('?1') : /iPhone|iPod|Android.+Mobile|Mobile Safari|Windows Phone|Opera Mini|IEMobile/i.test(ua)
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
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600;8..60,700;8..60,900&family=DM+Sans:wght@400;500;600;700;800;900&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,500&family=DM+Mono:wght@400;500&display=swap"
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
        {/* X (Twitter) conversion pixel — measures ad-driven signups.
            afterInteractive, matching the other tags: X's snippet is written
            for a <head> insert, but a blocking third-party script in head
            delays first paint, and conversion tracking does not need to run
            before the page is usable. */}
        <Script id="x-pixel" strategy="afterInteractive">
          {`
            !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
            },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
            a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
            twq('config','rc0t5');
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
        <ViewportProvider mobile={mobile}>{children}</ViewportProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
