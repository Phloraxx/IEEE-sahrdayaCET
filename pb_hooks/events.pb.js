onRecordBeforeUpdateRequest(async (e) => {
  const record = e.record

  const isDeleted = record.get('isDeleted')
  if (isDeleted === true) {
    record.set('status', 'completed')
    record.set('registrationOpen', false)
  }
}, 'events')
