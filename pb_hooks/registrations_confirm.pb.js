onRecordAfterCreateRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  if (record.get('registrationStatus') === 'confirmed' && !record.get('ticketId')) {
    const ticketId = 'TKT-' + $os.crypto().randomBytes(6).toString('hex')
    record.set('ticketId', ticketId)
    await dao.saveRecord(record)
    $app.logger().info('Ticket generated: ' + ticketId + ' for registration ' + record.getId())
  }
}, 'registrations')

onRecordAfterUpdateRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  if (record.get('checkedIn') === true && !record.get('checkedInAt')) {
    record.set('checkedInAt', new Date().toISOString())
    await dao.saveRecord(record)
  }

  if (record.get('registrationStatus') === 'confirmed' && !record.get('ticketId')) {
    const ticketId = 'TKT-' + $os.crypto().randomBytes(6).toString('hex')
    record.set('ticketId', ticketId)
    await dao.saveRecord(record)
    $app.logger().info('Ticket generated: ' + ticketId + ' for registration ' + record.getId())
  }
}, 'registrations')
