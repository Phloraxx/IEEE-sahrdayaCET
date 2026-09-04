var catalogue = require(__hooks + "/academic-options.generated.js")

function clean(value) {
  return String(value == null ? "" : value).trim()
}

function lookupKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

var semesterYears = {}
var semesterSet = {}
for (var i = 0; i < catalogue.semesters.length; i++) {
  var semester = catalogue.semesters[i]
  semesterSet[semester.code] = true
  semesterYears[semester.code] = Number(semester.year) || 0
}

var programmeSet = {}
var programmeLabels = {}
var programmeAliases = {}
for (var p = 0; p < catalogue.programmes.length; p++) {
  var programme = catalogue.programmes[p]
  programmeSet[programme.code] = true
  programmeLabels[programme.code] = programme.label
  var names = [programme.code, programme.label].concat(programme.aliases || [])
  for (var n = 0; n < names.length; n++) {
    var key = lookupKey(names[n])
    if (!key) continue
    if (programmeAliases[key] && programmeAliases[key] !== programme.code) {
      throw new Error("Academic programme alias collision: " + names[n])
    }
    programmeAliases[key] = programme.code
  }
}
function normalizeSemester(value) {
  var raw = clean(value)
  if (!raw) return ""
  var direct = raw.toUpperCase()
  if (semesterSet[direct]) return direct
  var match = raw.match(/^(?:s|sem(?:ester)?)\s*([1-8])$/i)
  return match ? "S" + match[1] : ""
}

function yearForSemester(value) {
  var semester = normalizeSemester(value)
  return semester ? semesterYears[semester] || null : null
}

function semestersForYear(year) {
  var expected = Number(year) || 0
  var result = []
  for (var i = 0; i < catalogue.semesters.length; i++) {
    if (Number(catalogue.semesters[i].year) === expected) result.push(catalogue.semesters[i].code)
  }
  return result
}

function normalizeProgramme(value) {
  var key = lookupKey(value)
  return key ? programmeAliases[key] || "" : ""
}

function programmeLabel(value) {
  var code = normalizeProgramme(value)
  return code ? programmeLabels[code] || "" : ""
}

function isSemesterCode(value) {
  return !!semesterSet[clean(value).toUpperCase()]
}

function isProgrammeCode(value) {
  return !!programmeSet[clean(value).toUpperCase()]
}

module.exports = {
  catalogue: catalogue,
  isProgrammeCode: isProgrammeCode,
  isSemesterCode: isSemesterCode,
  normalizeProgramme: normalizeProgramme,
  normalizeSemester: normalizeSemester,
  programmeLabel: programmeLabel,
  semestersForYear: semestersForYear,
  yearForSemester: yearForSemester,
}
