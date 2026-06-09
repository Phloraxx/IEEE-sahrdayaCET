// Maintains event.registeredCount and event.checkedInCount
// when registrations are created, updated, or deleted.

onRecordAfterCreateRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  const status = record.get('registrationStatus')
  if (status !== 'confirmed') return

  const eventId = record.get('event')
  if (!eventId) return

  try {
    const event = await dao.findRecordById('events', eventId)
    const count = (event.get('registeredCount') || 0) + 1
    event.set('registeredCount', count)
    dao.saveRecord(event)
  } catch (err) {
    $app.logger().warn(`Failed to update registeredCount for event ${eventId}: ${err}`)
  }
}, 'registrations')

onRecordAfterUpdateRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  const eventId = record.get('event')
  if (!eventId) return

  const event = await dao.findRecordById('events', eventId).catch(() => null)
  if (!event) return

  try {
    // Track registrationStatus changes
    const oldStatus = record.getOriginal('registrationStatus')
    const newStatus = record.get('registrationStatus')

    if (oldStatus !== newStatus) {
      let delta = 0
      if (newStatus === 'confirmed') delta = 1
      else if (oldStatus === 'confirmed' && newStatus === 'cancelled') delta = -1

      if (delta !== 0) {
        const count = (event.get('registeredCount') || 0) + delta
        event.set('registeredCount', Math.max(0, count))
      }
    }

    // Track check-in changes
    const wasCheckedIn = record.getOriginal('checkedIn')
    const isCheckedIn = record.get('checkedIn')
    if (isCheckedIn && !wasCheckedIn) {
      const checkedCount = (event.get('checkedInCount') || 0) + 1
      event.set('checkedInCount', checkedCount)
    }

    dao.saveRecord(event)
  } catch (err) {
    $app.logger().warn(`Failed to update counters for event ${eventId}: ${err}`)
  }
}, 'registrations')

onRecordAfterDeleteRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  const status = record.get('registrationStatus')
  if (status !== 'confirmed') return

  const eventId = record.get('event')
  if (!eventId) return

  try {
    const event = await dao.findRecordById('events', eventId)
    const count = (event.get('registeredCount') || 0) - 1
    event.set('registeredCount', Math.max(0, count))
    dao.saveRecord(event)
  } catch (err) {
    $app.logger().warn(`Failed to decrement registeredCount for event ${eventId}: ${err}`)
  }
}, 'registrations')
