/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var users = app.findCollectionByNameOrId("users")
  var events = app.findCollectionByNameOrId("events")
  var registrations = app.findCollectionByNameOrId("registrations")

  var sessions = null
  try { sessions = app.findCollectionByNameOrId("event_sessions") } catch (_) {}
  if (!sessions) {
    sessions = new Collection({
      type: "base",
      name: "event_sessions",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "text", name: "title", required: true, max: 180 },
        { type: "date", name: "startsAt", required: true },
        { type: "date", name: "endsAt" },
        { type: "text", name: "venue", max: 250 },
        { type: "number", name: "sortOrder", min: 0 },
        { type: "bool", name: "attendanceEnabled" },
        { type: "bool", name: "checkInEnabled" },
        { type: "bool", name: "requiredForCertificate" },
        { type: "number", name: "attendanceWeight", min: 0, max: 100 },
        { type: "relation", name: "createdBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_event_sessions_event_order ON event_sessions (event, sortOrder, startsAt)',
        'CREATE INDEX idx_event_sessions_event_start ON event_sessions (event, startsAt)',
      ],
    })
    app.save(sessions)
  }

  var attendance = null
  try { attendance = app.findCollectionByNameOrId("attendance_records") } catch (_) {}
  if (!attendance) {
    attendance = new Collection({
      type: "base",
      name: "attendance_records",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "relation", name: "session", collectionId: sessions.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "relation", name: "registration", collectionId: registrations.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "select", name: "type", values: ["present", "entry", "exit", "manual_add", "manual_remove"], maxSelect: 1, required: true },
        { type: "date", name: "occurredAt", required: true },
        { type: "relation", name: "operator", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "select", name: "source", values: ["scanner", "manual", "system"], maxSelect: 1, required: true },
        { type: "text", name: "deviceId", max: 180 },
        { type: "text", name: "idempotencyKey", max: 180 },
        { type: "text", name: "note", max: 2000 },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: [
        'CREATE INDEX idx_attendance_event_session ON attendance_records (event, session)',
        'CREATE INDEX idx_attendance_session_registration_time ON attendance_records (session, registration, occurredAt)',
        'CREATE INDEX idx_attendance_registration_time ON attendance_records (registration, occurredAt)',
        'CREATE UNIQUE INDEX idx_attendance_idempotency ON attendance_records (idempotencyKey) WHERE idempotencyKey != ""',
      ],
    })
    app.save(attendance)
  }
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("attendance_records")) } catch (_) {}
  try { app.delete(app.findCollectionByNameOrId("event_sessions")) } catch (_) {}
})
