/// <reference path="../pb_data/types.d.ts" />

onBootstrap(function (e) {
  e.next()

  var host = String($os.getenv("SMTP_HOST") || "").trim()
  if (!host) return

  try {
    var settings = e.app.settings()
    var port = Number($os.getenv("SMTP_PORT") || 587)
    var username = String($os.getenv("SMTP_USERNAME") || "").trim()
    var password = String($os.getenv("SMTP_PASSWORD") || "")
    var tlsRaw = String($os.getenv("SMTP_TLS") || "").trim().toLowerCase()
    var authMethod = String($os.getenv("SMTP_AUTH_METHOD") || "").trim()
    var localName = String($os.getenv("SMTP_LOCAL_NAME") || "").trim()
    var senderRaw = String($os.getenv("SMTP_FROM") || "").trim()
    var sender = { address: senderRaw, name: "IEEE Sahrdaya Student Branch" }
    var senderMatch = senderRaw.match(/^(.*?)\s*<([^>]+)>$/)
    if (senderMatch) {
      sender.address = String(senderMatch[2] || "").trim()
      sender.name = String(senderMatch[1] || "").trim().replace(/^['\"]|['\"]$/g, "") || sender.name
    }
    var siteUrl = String($os.getenv("SITE_URL") || "").trim().replace(/\/+$/, "")

    settings.smtp.enabled = true
    settings.smtp.host = host
    settings.smtp.port = isFinite(port) && port > 0 ? port : 587
    if (username) settings.smtp.username = username
    if (password) settings.smtp.password = password
    settings.smtp.tls = tlsRaw ? tlsRaw !== "false" : settings.smtp.port !== 25
    if (authMethod) settings.smtp.authMethod = authMethod
    if (localName) settings.smtp.localName = localName

    if (sender.address) settings.meta.senderAddress = sender.address
    if (sender.name) settings.meta.senderName = sender.name
    if (siteUrl) settings.meta.appURL = siteUrl

    e.app.save(settings)
  } catch (err) {
    console.log("[mail] failed to apply SMTP settings:", err)
  }
})
