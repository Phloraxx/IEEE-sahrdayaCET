import QRCode from 'qrcode'

export interface QRCodeOptions {
  size?: number
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  margin?: number
  color?: {
    dark?: string
    light?: string
  }
}

export async function generateQRCode(
  ticketId: string,
  options?: QRCodeOptions
): Promise<string> {
  const finalOptions = {
    size: 300,
    errorCorrectionLevel: 'M' as const,
    margin: 4,
    color: { dark: '#000000', light: '#FFFFFF' },
    ...options,
  }

  const qrCodeDataUrl = await QRCode.toDataURL(ticketId, {
    width: finalOptions.size,
    errorCorrectionLevel: finalOptions.errorCorrectionLevel,
    margin: finalOptions.margin,
    color: finalOptions.color,
    type: 'image/png',
  })

  return qrCodeDataUrl.replace(/^data:image\/png;base64,/, '')
}

export async function generateQRCodeDataUrl(
  ticketId: string,
  options?: QRCodeOptions
): Promise<string> {
  const base64 = await generateQRCode(ticketId, options)
  return `data:image/png;base64,${base64}`
}
