onRecordBeforeCreateRequest(async (e) => {
  const record = e.record
  const dao = $app.dao()

  const eventId = record.get('event')
  if (!eventId) throw new BadRequestError('Event is required')

  const event = await dao.findRecordById('events', eventId)
  if (!event) throw new BadRequestError('Event not found')

  if (event.get('registrationOpen') !== true) {
    throw new BadRequestError('Registration is not open for this event')
  }

  const deadline = event.get('registrationDeadline')
  if (deadline) {
    const now = new Date()
    const deadlineDate = new Date(deadline)
    if (now > deadlineDate) {
      throw new BadRequestError('Registration deadline has passed')
    }
  }

  await dao.runInTransaction(async (txDao) => {
    const txEvent = await txDao.findRecordById('events', eventId)
    const maxCapacity = txEvent.get('maxCapacity')
    const registeredCount = txEvent.get('registeredCount') || 0
    if (maxCapacity && registeredCount >= maxCapacity) {
      throw new BadRequestError('Event has reached maximum capacity')
    }
  })

  const formTemplate = event.get('formTemplate')
  if (formTemplate && Array.isArray(formTemplate)) {
    const formResponses = record.get('formResponses') || {}
    for (const field of formTemplate) {
      if (field.required) {
        const val = formResponses[field.id]
        if (val === undefined || val === null || val === '') {
          throw new BadRequestError(`"${field.label || 'A required field'}" is required`)
        }
      }
    }
  }

  const userId = record.get('user')
  if (userId) {
    const user = await dao.findRecordById('users', userId)
    if (!user) throw new BadRequestError('User not found')

    const escapedUserId = userId.replace(/'/g, "''")
    const escapedEventId = eventId.replace(/'/g, "''")
    const duplicates = await dao.findRecordsByFilter(
      'registrations',
      'user = "' + escapedUserId + '" && event = "' + escapedEventId + '" && registrationStatus != "cancelled"'
    )
    if (duplicates.length > 0) {
      throw new BadRequestError('You are already registered for this event')
    }
  }

  const price = event.get('price')
  if (price === 0 || price === undefined || price === null) {
    record.set('paymentStatus', 'not_required')
    record.set('registrationStatus', 'confirmed')
  }
}, 'registrations')
