onRecordAfterCreateRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  if (record.get('registrationStatus') !== 'confirmed') return

  const eventId = record.get('event')
  if (!eventId) return

  try {
    await dao.runInTransaction(async (txDao) => {
      const event = await txDao.findRecordById('events', eventId)
      const count = (event.get('registeredCount') || 0) + 1
      event.set('registeredCount', count)
      await txDao.saveRecord(event)
    })
  } catch (err) {
    $app.logger().warn('Failed to update registeredCount for event ' + eventId + ': ' + err)
  }
}, 'registrations')

onRecordAfterUpdateRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  const eventId = record.get('event')
  if (!eventId) return

  try {
    await dao.runInTransaction(async (txDao) => {
      const event = await txDao.findRecordById('events', eventId)

      const oldStatus = record.getOriginal('registrationStatus')
      const newStatus = record.get('registrationStatus')
      if (oldStatus !== newStatus) {
        let delta = 0
        if (newStatus === 'confirmed') delta = 1
        else if (oldStatus === 'confirmed' && newStatus === 'cancelled') delta = -1
        if (delta !== 0) {
          event.set('registeredCount', Math.max(0, (event.get('registeredCount') || 0) + delta))
        }
      }

      const wasCheckedIn = record.getOriginal('checkedIn')
      const isCheckedIn = record.get('checkedIn')
      if (isCheckedIn && !wasCheckedIn) {
        event.set('checkedInCount', (event.get('checkedInCount') || 0) + 1)
      }

      await txDao.saveRecord(event)
    })
  } catch (err) {
    $app.logger().warn('Failed to update counters for event ' + eventId + ': ' + err)
  }
}, 'registrations')

onRecordAfterDeleteRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  if (record.get('registrationStatus') !== 'confirmed') return

  const eventId = record.get('event')
  if (!eventId) return

  try {
    await dao.runInTransaction(async (txDao) => {
      const event = await txDao.findRecordById('events', eventId)
      event.set('registeredCount', Math.max(0, (event.get('registeredCount') || 0) - 1))
      await txDao.saveRecord(event)
    })
  } catch (err) {
    $app.logger().warn('Failed to decrement registeredCount for event ' + eventId + ': ' + err)
  }
}, 'registrations')
