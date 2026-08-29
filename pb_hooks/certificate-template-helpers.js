var CERTIFICATE_TYPES = ["participation", "completion", "achievement", "appreciation", "volunteer", "speaker"]

function body(e) {
  try { return e.requestInfo().body || {} } catch (_) { return {} }
}

function boolValue(value) {
  return value === true || String(value || "").toLowerCase() === "true" || String(value || "") === "1"
}

function eventRecord(app, eventId) {
  try { return app.findRecordById("events", String(eventId || "")) } catch (_) { return null }
}

function templateRecord(app, id) {
  try { return app.findRecordById("certificate_templates", String(id || "")) } catch (_) { return null }
}

function canEvent(app, auth, event, capability) {
  if (!event) return false
  return require(__hooks + "/workspace-authorization.js").hasEventCapability(app, auth, capability, event)
}

function assertTemplateEvent(app, template, eventId) {
  if (!template || template.getString("scopeType") !== "event" || template.getString("event") !== String(eventId || "")) return false
  return true
}

function parseJson(value) {
  return require(__hooks + "/certificate-template-rules.js").objectValue(value)
}

function fileDescriptor(record, field, name) {
  return name ? {
    name: name,
    url: "/api/app/certificate-templates/" + record.id + "/assets/" + field + "/" + encodeURIComponent(name)
  } : null
}
function payload(record, auth) {
  var signatures = record.getStringSlice("sourceSignatures") || []
  return {
    id: record.id,
    name: record.getString("name") || "",
    scopeType: record.getString("scopeType") || "event",
    societyId: record.getString("society") || "",
    eventId: record.getString("event") || "",
    certificateType: record.getString("certificateType") || "participation",
    version: record.getFloat("version") || 1,
    status: record.getString("status") || "draft",
    canvasWidth: record.getFloat("canvasWidth") || 0,
    canvasHeight: record.getFloat("canvasHeight") || 0,
    layout: parseJson(record.get("layout")),
    emailSubject: record.getString("emailSubject") || "",
    emailText: record.getString("emailText") || "",
    contentHash: record.getString("contentHash") || "",
    publishedAt: record.getString("publishedAt") || "",
    created: record.getString("created") || "",
    updated: record.getString("updated") || "",
    files: {
      sourceBackground: fileDescriptor(record, "sourceBackground", record.getString("sourceBackground") || ""),
      sourceSignatures: signatures.map(function (name) { return fileDescriptor(record, "sourceSignatures", name) }),
      renderBase: fileDescriptor(record, "renderBase", record.getString("renderBase") || ""),
    },
  }
}

function nextVersion(app, eventId, name) {
  var rows = []
  try {
    rows = app.findRecordsByFilter("certificate_templates", "event = {:event} && name = {:name}", "-version", 1, 0, { event: eventId, name: name })
  } catch (_) { rows = [] }
  return rows.length ? (rows[0].getFloat("version") || 0) + 1 : 1
}

function applyDraftText(record, requestBody) {
  requestBody = requestBody || {}
  if (Object.prototype.hasOwnProperty.call(requestBody, "layout")) record.set("layout", parseJson(requestBody.layout))
  if (Object.prototype.hasOwnProperty.call(requestBody, "emailSubject")) record.set("emailSubject", String(requestBody.emailSubject || "").trim().slice(0, 240))
  if (Object.prototype.hasOwnProperty.call(requestBody, "emailText")) record.set("emailText", String(requestBody.emailText || "").slice(0, 50000))
  // V1 mail is plain-text authored and server-rendered into safe HTML later.
  record.set("emailHtml", "")
}
function uploadedFiles(e, field) {
  e.request.parseMultipartForm(8 * 1024 * 1024)
  var form = e.request.multipartForm
  var headers = form && form.file ? (form.file[field] || []) : []
  var files = []
  for (var i = 0; i < headers.length; i++) files.push($filesystem.fileFromMultipart(headers[i]))
  return files
}

function oneUpload(e, field) {
  var files = uploadedFiles(e, field)
  if (files.length > 1) throw new Error("Only one " + field + " file can be uploaded")
  return files.length ? files[0] : null
}

function applyUploads(e, record, requestBody) {
  var validate = require(__hooks + "/certificate-file-validation.js").validate
  var background = oneUpload(e, "sourceBackground")
  var renderBase = oneUpload(e, "renderBase")
  var signatures = uploadedFiles(e, "sourceSignatures")
  if (signatures.length > 6) throw new Error("A maximum of six signature images is supported")

  if (background) {
    validate(background, "background")
    record.set("sourceBackground", background)
  } else if (boolValue(requestBody.removeSourceBackground)) {
    record.set("sourceBackground", "")
  }

  if (signatures.length) {
    for (var i = 0; i < signatures.length; i++) validate(signatures[i], "signature")
    record.set("sourceSignatures", signatures)
  } else if (boolValue(requestBody.removeSourceSignatures)) {
    record.set("sourceSignatures", [])
  }

  if (renderBase) {
    var renderInfo = validate(renderBase, "renderBase")
    record.set("renderBase", renderBase)
    record.set("canvasWidth", renderInfo.width)
    record.set("canvasHeight", renderInfo.height)
  } else if (boolValue(requestBody.removeRenderBase)) {
    record.set("renderBase", "")
    record.set("canvasWidth", 0)
    record.set("canvasHeight", 0)
  }
}

function publishHash(record) {
  var rules = require(__hooks + "/certificate-template-rules.js")
  var snapshot = rules.recordSnapshot(record)
  snapshot.contentHash = ""
  snapshot.publishedBy = ""
  snapshot.publishedAt = ""
  return $security.sha256(rules.stableStringify(snapshot))
}
function cloneFile(fs, source, filename) {
  if (!filename) return null
  return fs.getReuploadableFile(source.baseFilesPath() + "/" + filename, false)
}

function cloneAsDraft(app, source, actorId) {
  var collection = app.findCollectionByNameOrId("certificate_templates")
  var record = new Record(collection, {
    name: source.getString("name") || "Certificate",
    scopeType: "event",
    society: source.getString("society") || "",
    event: source.getString("event") || "",
    certificateType: source.getString("certificateType") || "participation",
    version: nextVersion(app, source.getString("event") || "", source.getString("name") || "Certificate"),
    status: "draft",
    canvasWidth: source.getFloat("canvasWidth") || 0,
    canvasHeight: source.getFloat("canvasHeight") || 0,
    layout: parseJson(source.get("layout")),
    emailSubject: source.getString("emailSubject") || "",
    emailText: source.getString("emailText") || "",
    emailHtml: "",
    createdBy: actorId || "",
  })

  var fs = app.newFilesystem()
  try {
    var background = cloneFile(fs, source, source.getString("sourceBackground") || "")
    var renderBase = cloneFile(fs, source, source.getString("renderBase") || "")
    var sourceSignatures = source.getStringSlice("sourceSignatures") || []
    var signatures = []
    for (var i = 0; i < sourceSignatures.length; i++) {
      var signature = cloneFile(fs, source, sourceSignatures[i])
      if (signature) signatures.push(signature)
    }
    if (background) record.set("sourceBackground", background)
    if (renderBase) record.set("renderBase", renderBase)
    if (signatures.length) record.set("sourceSignatures", signatures)
    app.save(record)
  } finally {
    try { fs.close() } catch (_) {}
  }
  return record
}

function errorResponse(e, status, code, message) {
  return e.json(status, { code: code, error: message })
}

function defaultLayout() {
  return {
    name: { x: 0.5, y: 0.47, maxWidth: 0.62, preferredFontSize: 132, minFontSize: 68, align: "center", color: "#0B243D", fontFamily: "noto-sans" },
    credentialId: { x: 0.05, y: 0.88, fontSize: 30, align: "left", color: "#0B243D" },
    qr: { x: 0.86, y: 0.76, size: 0.11 },
  }
}

function defaultEmailSubject() { return "Your certificate | {{eventTitle}}" }
function defaultEmailText() {
  return "Hi {{firstName}},\n\nThank you for being part of {{eventTitle}}.\n\nView and verify your certificate: {{verificationUrl}}\nCredential ID: {{credentialId}}\n\nIEEE Sahrdaya Student Branch"
}

function routeContext(e, capability) {
  var template = templateRecord($app, e.request.pathValue("id") || "")
  if (!template) return { status: 404, code: "TEMPLATE_NOT_FOUND", message: "Certificate template not found" }
  var event = eventRecord($app, template.getString("event") || "")
  if (!event || !canEvent($app, e.auth, event, capability)) return { status: 403, code: "FORBIDDEN", message: "You cannot manage this certificate template" }
  return { template: template, event: event }
}

module.exports = {
  CERTIFICATE_TYPES: CERTIFICATE_TYPES,
  defaultEmailSubject: defaultEmailSubject,
  defaultEmailText: defaultEmailText,
  defaultLayout: defaultLayout,
  error: errorResponse,
  applyDraftText: applyDraftText,
  applyUploads: applyUploads,
  assertTemplateEvent: assertTemplateEvent,
  body: body,
  canEvent: canEvent,
  cloneAsDraft: cloneAsDraft,
  eventRecord: eventRecord,
  nextVersion: nextVersion,
  payload: payload,
  publishHash: publishHash,
  routeContext: routeContext,
  templateRecord: templateRecord,
}
