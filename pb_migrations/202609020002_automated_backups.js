/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const settings = app.settings()
  // Containers run in UTC. 21:30 UTC = 03:00 Asia/Kolkata.
  settings.backups.cron = "30 21 * * *"
  settings.backups.cronMaxKeep = 14
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.backups.cron = ""
  settings.backups.cronMaxKeep = 3
  app.save(settings)
})
