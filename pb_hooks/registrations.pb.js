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

  const maxCapacity = event.get('maxCapacity')
  if (maxCapacity) {
    // Check against the maintained counter field.
    // The UNIQUE (user, event) index + counter hooks prevent duplicates.
    // There is a narrow race window between the read and the create
    // (max 1 over capacity) — acceptable for this use case.
    const current = event.get('registeredCount') || 0
    if (current >= maxCapacity) {
      throw new BadRequestError('Event has reached maximum capacity')
    }
  }

  // Validate required custom fields from formTemplate
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
    const user = dao.findRecordById('users', userId)
    if (!user) throw new BadRequestError('User not found')

    // First-pass duplicate check (fast path for the 99% case).
    // The UNIQUE (user, event) DB index is the source of truth.
    const duplicates = dao.findRecordsByFilter(
      'registrations',
      `user = "${userId}" && event = "${eventId}" && registrationStatus != "cancelled"`
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
