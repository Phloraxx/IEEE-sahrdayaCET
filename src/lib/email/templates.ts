const baseTheme = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #00629B, #003B6F); padding: 32px; text-align: center; }
  .header h1 { color: white; margin: 0; font-size: 24px; }
  .content { padding: 32px; }
  .footer { background: #f9fafb; padding: 24px 32px; text-align: center; color: #6b7280; font-size: 12px; }
  .button { display: inline-block; padding: 12px 24px; background: #00629B; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 600; }
`

export function registrationTemplate(variables: Record<string, string | number | undefined>): string {
  return `
<!DOCTYPE html>
<html><head><style>${baseTheme}</style></head><body>
<div class="container">
  <div class="header"><h1>Registration Confirmed</h1></div>
  <div class="content">
    <p>Hi ${variables.student_name || 'Student'},</p>
    <p>Your registration for <strong>${variables.event_name}</strong> is confirmed!</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:8px;color:#6b7280">Event</td><td style="padding:8px;font-weight:600">${variables.event_name}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Date</td><td style="padding:8px">${variables.event_date}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Venue</td><td style="padding:8px">${variables.event_venue || 'TBA'}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Ticket ID</td><td style="padding:8px;font-family:monospace">${variables.ticket_id}</td></tr>
    </table>
    ${variables.ticket_url ? `<p style="text-align:center"><a href="${variables.ticket_url}" class="button">View Your Ticket</a></p>` : ''}
    <p style="color:#6b7280;font-size:14px;margin-top:24px">Show the QR code at the venue for check-in.</p>
  </div>
  <div class="footer">
    <p>IEEE Sahrdaya Student Branch<br>Sahrdaya College of Engineering & Technology, Kodakara</p>
  </div>
</div>
</body></html>`.trim()
}

export function receiptTemplate(variables: Record<string, string | number | undefined>): string {
  return `
<!DOCTYPE html>
<html><head><style>${baseTheme}</style></head><body>
<div class="container">
  <div class="header"><h1>Payment Receipt</h1></div>
  <div class="content">
    <p>Hi ${variables.student_name || 'Student'},</p>
    <p>Your payment for <strong>${variables.event_name}</strong> has been received.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:8px;color:#6b7280">Amount Paid</td><td style="padding:8px;font-weight:600">₹${variables.amount || '0'}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Transaction ID</td><td style="padding:8px;font-family:monospace">${variables.transaction_id || 'N/A'}</td></tr>
      <tr><td style="padding:8px;color:#6b7280">Ticket ID</td><td style="padding:8px;font-family:monospace">${variables.ticket_id}</td></tr>
    </table>
    <p style="color:#6b7280;font-size:14px">A PDF receipt is attached to this email.</p>
  </div>
  <div class="footer">
    <p>IEEE Sahrdaya Student Branch<br>Sahrdaya College of Engineering & Technology, Kodakara</p>
  </div>
</div>
</body></html>`.trim()
}
