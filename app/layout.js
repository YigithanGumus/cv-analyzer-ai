import './globals.css';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';

const grotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-grotesk',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-mono',
});

export const metadata = {
  title: 'CV Analyzer AI',
  description: 'AI destekli CV analiz araci: ozet, eksik skill ve ATS skoru.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body className={`${grotesk.variable} ${plexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
