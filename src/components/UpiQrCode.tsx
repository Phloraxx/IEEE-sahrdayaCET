'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { generateQRDataUrl } from '@/lib/qr';

interface UpiQrCodeProps {
  data: string;
  size?: number;
}

export function UpiQrCode({ data, size = 200 }: UpiQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!data) return;

    generateQRDataUrl(data, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then(setDataUrl)
      .catch(() => setError(true));
  }, [data, size]);

  return (
    <div className="relative">
      {dataUrl ? (
        <img
          src={dataUrl}
          width={size}
          height={size}
          alt="UPI QR Code"
          className="rounded-xl"
        />
      ) : (
        <div
          className="rounded-xl bg-gray-100 flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          <Loader2 className="w-8 h-8 text-ieee-blue animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-xl">
          <span className="text-xs text-gray-500">Failed to generate QR</span>
        </div>
      )}
    </div>
  );
}
