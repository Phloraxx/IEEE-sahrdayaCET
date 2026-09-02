// Shared event-end semantics for PocketBase command hooks.
// A time-TBC event is date-only: without an explicit endDate it stays active
// until the end of its Asia/Kolkata calendar day, not local midnight.
const IST_OFFSET_MS = 330 * 60 * 1000

function eventEndDate(event) {
  var explicitEnd = event.getString("endDate")
  if (explicitEnd) return new Date(explicitEnd)

  var startValue = event.getString("date")
  if (!startValue) return null
  var start = new Date(startValue)
  if (isNaN(start.getTime())) return null
  if (!event.getBool("timeTbc")) return start

  var shifted = new Date(start.getTime() + IST_OFFSET_MS)
  var nextMidnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  ) - IST_OFFSET_MS
  return new Date(nextMidnightUtc)
}

module.exports = { eventEndDate }
