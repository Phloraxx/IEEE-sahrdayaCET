var academic = require(__hooks + "/academic-options.js")

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

function unique(values) {
  var seen = {}
  var result = []
  for (var i = 0; i < values.length; i++) {
    var value = values[i]
    if (!value || seen[value]) continue
    seen[value] = true
    result.push(value)
  }
  return result
}
function semesterList(value) {
  var raw = jsonValue(value)
  if (!Array.isArray(raw)) return []
  return unique(raw.map(academic.normalizeSemester).filter(Boolean))
}

function programmeList(value) {
  var raw = jsonValue(value)
  if (!Array.isArray(raw)) return []
  return unique(raw.map(academic.normalizeProgramme).filter(Boolean))
}

function eventAudience(event) {
  return {
    semesters: semesterList(event && event.get("eligibleSemesters")),
    programmes: programmeList(event && event.get("eligibleProgrammes")),
  }
}

function normalizeAttendee(input) {
  input = input && typeof input === "object" ? input : {}
  var explicitProgramme = String(input.programmeCode || "").trim()
  var branch = String(input.branch || "").trim().slice(0, 160)
  var programmeCode = explicitProgramme
    ? academic.normalizeProgramme(explicitProgramme)
    : academic.normalizeProgramme(branch)
  return {
    programmeCode: programmeCode,
    semester: academic.normalizeSemester(input.semester),
    branch: branch,
  }
}
function evaluate(event, input) {
  var audience = eventAudience(event)
  var attendee = normalizeAttendee(input)
  if (audience.semesters.length) {
    if (!attendee.semester) return { eligible: false, code: "SEMESTER_REQUIRED", error: "Select your semester to continue", attendee: attendee, audience: audience }
    if (audience.semesters.indexOf(attendee.semester) === -1) return { eligible: false, code: "SEMESTER_NOT_ELIGIBLE", error: "This event is not open to your semester", attendee: attendee, audience: audience }
  }
  if (audience.programmes.length) {
    if (!attendee.programmeCode) return { eligible: false, code: "PROGRAMME_REQUIRED", error: "Select your programme to continue", attendee: attendee, audience: audience }
    if (audience.programmes.indexOf(attendee.programmeCode) === -1) return { eligible: false, code: "PROGRAMME_NOT_ELIGIBLE", error: "This event is not open to your programme", attendee: attendee, audience: audience }
  }
  if (attendee.programmeCode === "OTHER" && !attendee.branch) {
    return { eligible: false, code: "OTHER_PROGRAMME_REQUIRED", error: "Enter your programme name", attendee: attendee, audience: audience }
  }
  return { eligible: true, code: "ELIGIBLE", error: "", attendee: attendee, audience: audience }
}

function waitlistInput(record) {
  return {
    programmeCode: record ? record.getString("programmeCode") : "",
    semester: record ? record.getString("semester") : "",
  }
}

module.exports = {
  eventAudience: eventAudience,
  normalizeAttendee: normalizeAttendee,
  evaluate: evaluate,
  waitlistInput: waitlistInput,
}