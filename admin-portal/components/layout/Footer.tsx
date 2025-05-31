'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

type FooterProps = Record<string, never>;

/**
 * Footer component with Hedera branding and dark/light theme support
 * Displays Hedera and "Built on Hedera" logos with appropriate theming
 * @returns Footer component with logo branding
 */
export function Footer({}: FooterProps) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <footer className="bg-white mt-auto border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex items-center space-x-6">
            <Image
              src={isDark ? '/hashgraph-dark.svg' : '/hashgraph-light.svg'}
              alt="Hashgraph"
              width={121}
              height={32}
              className="h-8 w-auto"
            />
            <div className="h-6 w-px bg-border" />
            <Image
              src={
                isDark
                  ? '/built-on-hedera-dark.svg'
                  : '/built-on-hedera-light.svg'
              }
              alt="Built on Hedera"
              width={89}
              height={40}
              className="h-10 w-auto"
            />
          </div>
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Powered by Hedera Hashgraph
            </p>
            <p className="text-xs text-muted-foreground">
              © 2024 Hedera AI Studio. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
