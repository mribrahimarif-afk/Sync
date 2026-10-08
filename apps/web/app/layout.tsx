import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sync',
  description: 'Sync - club and membership management (foundation build)',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <span className="brand">Sync</span>
        </header>
        <main id="main" className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
