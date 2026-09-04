var MAX_REQUIREMENTS = 12
var MAX_REQUIREMENT_LENGTH = 200
var MAX_ATTENDEE_NOTE_LENGTH = 4000

function jsonValue(value) {
  if (!value) return null
  if (typeof value === "object" && typeof value.string === "function") {
    try { return JSON.parse(String(value.string() || "null")) } catch (_) { return null }
  }
  if (Array.isArray(value)) {
    if (!value.length || typeof value[0] !== "number") return value
    try {
      var text = ""
      for (var i = 0; i < value.length; i++) text += String.fromCharCode(Number(value[i]) || 0)
      return JSON.parse(text)
    } catch (_) { return null }
  }
  if (typeof value === "string") {
    try { return JSON.parse(value) } catch (_) { return null }
  }
  return typeof value === "object" ? value : null
}

function normalizeRequirements(value) {
  var raw = jsonValue(value)
  if (raw === null) return { ok: true, requirements: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "Event requirements must be a list" }
  var requirements = []
  for (var i = 0; i < raw.length; i++) {
    if (raw[i] === null || raw[i] === undefined || raw[i] === "") continue
    if (typeof raw[i] !== "string") return { ok: false, error: "Each event requirement must be text" }
    var item = raw[i].trim()
    if (!item) continue
    if (item.length > MAX_REQUIREMENT_LENGTH) {
      return { ok: false, error: "Each event requirement must be 200 characters or fewer" }
    }
    requirements.push(item)
  }
  if (requirements.length > MAX_REQUIREMENTS) {
    return { ok: false, error: "Add at most 12 event requirements" }
  }
  return { ok: true, requirements: requirements }
}

function normalizeAttendeeNote(value) {
  var note = String(value || "").trim()
  if (note.length > MAX_ATTENDEE_NOTE_LENGTH) {
    return { ok: false, error: "Attendee note must be 4000 characters or fewer" }
  }
  return { ok: true, note: note }
}

function normalizeRecord(record) {
  var requirements = normalizeRequirements(record && record.get ? record.get("requirements") : null)
  if (!requirements.ok) return requirements
  var attendeeNote = normalizeAttendeeNote(record && record.getString ? record.getString("attendeeNote") : "")
  if (!attendeeNote.ok) return attendeeNote
  record.set("requirements", requirements.requirements)
  record.set("attendeeNote", attendeeNote.note)
  return { ok: true, requirements: requirements.requirements, attendeeNote: attendeeNote.note }
}

module.exports = {
  MAX_REQUIREMENTS: MAX_REQUIREMENTS,
  MAX_REQUIREMENT_LENGTH: MAX_REQUIREMENT_LENGTH,
  MAX_ATTENDEE_NOTE_LENGTH: MAX_ATTENDEE_NOTE_LENGTH,
  normalizeRequirements: normalizeRequirements,
  normalizeAttendeeNote: normalizeAttendeeNote,
  normalizeRecord: normalizeRecord,
}
