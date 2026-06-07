onRecordAfterCreateRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  const status = record.get('registrationStatus')
  if (status === 'confirmed' && !record.get('ticketId')) {
    const ticketId = 'TKT-' + $os.crypto().randomBytes(6).toString('hex')
    record.set('ticketId', ticketId)
    dao.saveRecord(record)
    $app.logger().info(`Ticket generated: ${ticketId} for registration ${record.getId()}`)
  }
}, 'registrations')

onRecordAfterUpdateRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  const checkedIn = record.get('checkedIn')
  if (checkedIn === true && !record.get('checkedInAt')) {
    record.set('checkedInAt', new Date().toISOString())
    dao.saveRecord(record)
  }

  const status = record.get('registrationStatus')
  if (status === 'confirmed' && !record.get('ticketId')) {
    const ticketId = 'TKT-' + $os.crypto().randomBytes(6).toString('hex')
    record.set('ticketId', ticketId)
    dao.saveRecord(record)
    $app.logger().info(`Ticket generated: ${ticketId} for registration ${record.getId()}`)
  }
}, 'registrations')
