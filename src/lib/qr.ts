export interface QRCodeOptions {
    width?: number
    margin?: number
    color?: {
        dark?: string
        light?: string
    }
}

export async function generateQRDataUrl(
    text: string,
    options?: QRCodeOptions
): Promise<string> {
    const QRCode = (await import('qrcode')).default
    const svg = await QRCode.toString(text, {
        type: 'svg',
        width: options?.width ?? 400,
        margin: options?.margin ?? 2,
        color: options?.color ?? { dark: '#000000', light: '#FFFFFF' },
    })
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function downloadQR(dataUrl: string, filename: string): void {
    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}
