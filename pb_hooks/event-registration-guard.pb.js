/// <reference path="../pb_data/types.d.ts" />

// Defense-in-depth registration lifecycle guard.
// The main registrations hook handles capacity, forms, coupons and payment state;
// this hook keeps event visibility/registration lifecycle rules explicit and
// prevents direct PocketBase API clients from registering for completed/past
// events or outside the configured registration window.

onRecordCreateRequest(function (e) {
    var reg = e.record
    var eventId = reg.getString("event")
    if (!eventId) {
        throw e.badRequestError("Missing event ID")
    }

    var event
    try {
        event = $app.findRecordById("events", eventId)
    } catch (err) {
        throw e.badRequestError("Event not found")
    }

    if (event.getBool("isDeleted")) {
        throw e.badRequestError("Event is not available for registration")
    }

    // Only actively published events may accept registrations. Completed,
    // draft and cancelled events remain readable according to collection rules
    // but cannot receive new registrations.
    if (event.getString("status") !== "published") {
        throw e.badRequestError("Event is not available for registration")
    }

    if (!event.getBool("registrationOpen")) {
        throw e.badRequestError("Registration is closed for this event")
    }

    var now = new Date()
    var endValue = event.getString("endDate") || event.getString("date")
    if (endValue) {
        var endDate = new Date(endValue)
        if (!isNaN(endDate.getTime()) && endDate <= now) {
            throw e.badRequestError("This event has already ended")
        }
    }

    var registrationStart = event.getString("registrationStart")
    if (registrationStart) {
        var startDate = new Date(registrationStart)
        if (!isNaN(startDate.getTime()) && startDate > now) {
            throw e.badRequestError("Registration has not opened yet")
        }
    }

    var registrationDeadline = event.getString("registrationDeadline")
    if (registrationDeadline) {
        var deadlineDate = new Date(registrationDeadline)
        if (!isNaN(deadlineDate.getTime()) && deadlineDate < now) {
            throw e.badRequestError("Registration deadline has passed")
        }
    }

    e.next()
}, "registrations")
