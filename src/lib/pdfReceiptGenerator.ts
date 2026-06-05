import jsPDF from 'jspdf'

interface PaymentDetails {
  amount: number
  paidAt?: string
  transactionId?: string
  rrn?: string
  utr?: string
  senderName?: string
  upiId?: string
  paymentReference?: string
}

interface EventDetails {
  title: string
  venue?: string
  start_date?: string
  date?: string
}

interface UserDetails {
  name: string
  email: string
}

interface ReceiptData {
  ticketId: string
  registrationId: string
  user: UserDetails
  event: EventDetails
  payment: PaymentDetails
}

export async function generatePaymentReceipt(data: ReceiptData): Promise<string> {
  const doc = new jsPDF()
  const margin = 20
  const pageWidth = doc.internal.pageSize.width
  let yPos = margin

  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('IEEE Sahrdaya SB', margin, yPos)
  yPos += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Advancing Technology for Humanity', margin, yPos)
  yPos += 15

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Payment Receipt', margin, yPos)
  yPos += 5
  doc.setLineWidth(0.5)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 10

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Payer Information', margin, yPos)
  yPos += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Name: ${data.user.name}`, margin + 5, yPos)
  yPos += 5
  doc.text(`Email: ${data.user.email}`, margin + 5, yPos)
  yPos += 10

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Event Details', margin, yPos)
  yPos += 7
  doc.setFontSize(10)
  doc.text(`Event: ${data.event.title}`, margin + 5, yPos)
  yPos += 5
  if (data.event.venue) {
    doc.text(`Venue: ${data.event.venue}`, margin + 5, yPos)
    yPos += 5
  }
  const eventDate = data.event.start_date || data.event.date
  if (eventDate) {
    doc.text(`Date: ${new Date(eventDate).toLocaleDateString('en-IN')}`, margin + 5, yPos)
    yPos += 5
  }
  doc.text(`Registration ID: ${data.registrationId}`, margin + 5, yPos)
  yPos += 10

  const boxY = yPos
  doc.setFillColor(240, 248, 255)
  doc.rect(margin, boxY, pageWidth - 2 * margin, 35, 'F')
  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(0.5)
  doc.rect(margin, boxY, pageWidth - 2 * margin, 35)
  yPos = boxY + 8
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Payment Details', margin + 5, yPos)
  yPos += 7
  doc.setFontSize(14)
  doc.text(`Amount Paid: ₹${data.payment.amount.toFixed(2)}`, margin + 5, yPos)
  yPos = boxY + 35 + 10

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Transaction Details', margin, yPos)
  yPos += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  if (data.payment.paymentReference) {
    doc.text(`Reference: ${data.payment.paymentReference}`, margin + 5, yPos)
    yPos += 5
  }
  if (data.payment.transactionId) {
    doc.text(`Transaction ID: ${data.payment.transactionId}`, margin + 5, yPos)
    yPos += 5
  }
  if (data.payment.upiId) {
    doc.text(`UPI ID: ${data.payment.upiId}`, margin + 5, yPos)
    yPos += 5
  }

  return doc.output('datauristring').split(',')[1]
}
