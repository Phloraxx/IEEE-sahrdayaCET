/// <reference path="../pb_data/types.d.ts" />

// Older deployments created the events collection before the additive baseline.
// Keep the repair deliberately narrow: current event creation permits a blank
// venue, while some long-lived databases still reject it as required.
migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  const venue = events.fields.getByName("venue")
  if (!venue) throw new Error("events.venue is missing")

  venue.required = false
  venue.max = 250
  app.save(events)
}, (_app) => {
  // Forward-only compatibility repair; do not reintroduce the stale constraint.
})
