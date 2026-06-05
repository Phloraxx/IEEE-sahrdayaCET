const baseTheme = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #00629B, #003B6F); padding: 32px; text-align: center; }
  .header h1 { color: white; margin: 0; font-size: 24px; }
  .content { padding: 32px; }
  .footer { background: #f9fafb; padding: 24px 32px; text-align: center; color: #6b7280; font-size: 12px; }
  .button { display: inline-block; padding: 12px 24px; background: #00629B; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 600; }
`

function escapeHtml(value: string | number | undefined): string {
  if (value === undefined || value === null) return ''
  const str = String(value)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function registrationTemplate(variables: Record<string, string | number | undefined>): string {
  const name = escapeHtml(variables.student_name || 'Student')
  const eventName = escapeHtml(variables.event_name)
  const eventDate = escapeHtml(variables.event_date)
  const eventVenue = escapeHtml(variables.event_venue || 'TBA')
  const ticketId = escapeHtml(variables.ticket_id)
  const ticketUrl = variables.ticket_url ? escapeHtml(String(variables.ticket_url)) : ''

  return `
<!DOCTYPE html>
<html><head><style>${baseTheme}</style></head><body>
<div class="container">
  <div class="header"><h1>Registration Confirmed</h1></div>
  <div class="content">
    <p>Hi ${name},</p>
    <p>Your registration for <strong>${eventName}</strong> is confirmed!</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:8px;color:#6b7280">Event</td><td style="padding:8px;font-weight:600">${eventName}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Date</td><td style="padding:8px">${eventDate}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Venue</td><td style="padding:8px">${eventVenue}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Ticket ID</td><td style="padding:8px;font-family:monospace">${ticketId}</td></tr>
    </table>
    ${ticketUrl ? `<p style="text-align:center"><a href="${ticketUrl}" class="button">View Your Ticket</a></p>` : ''}
    <p style="color:#6b7280;font-size:14px;margin-top:24px">Show the QR code at the venue for check-in.</p>
  </div>
  <div class="footer">
    <p>IEEE Sahrdaya Student Branch<br>Sahrdaya College of Engineering & Technology, Kodakara</p>
  </div>
</div>
</body></html>`.trim()
}

export function receiptTemplate(variables: Record<string, string | number | undefined>): string {
  const name = escapeHtml(variables.student_name || 'Student')
  const eventName = escapeHtml(variables.event_name)
  const amount = escapeHtml(variables.amount || '0')
  const transactionId = escapeHtml(variables.transaction_id || 'N/A')
  const ticketId = escapeHtml(variables.ticket_id)

  return `
<!DOCTYPE html>
<html><head><style>${baseTheme}</style></head><body>
<div class="container">
  <div class="header"><h1>Payment Receipt</h1></div>
  <div class="content">
    <p>Hi ${name},</p>
    <p>Your payment for <strong>${eventName}</strong> has been received.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:8px;color:#6b7280">Amount Paid</td><td style="padding:8px;font-weight:600">₹${amount}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Transaction ID</td><td style="padding:8px;font-family:monospace">${transactionId}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Ticket ID</td><td style="padding:8px;font-family:monospace">${ticketId}</td></tr>
    </table>
    <p style="color:#6b7280;font-size:14px">A PDF receipt is attached to this email.</p>
  </div>
  <div class="footer">
    <p>IEEE Sahrdaya Student Branch<br>Sahrdaya College of Engineering & Technology, Kodakara</p>
  </div>
</div>
</body></html>`.trim()
}
