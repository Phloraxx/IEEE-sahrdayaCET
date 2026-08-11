/// <reference path="../pb_data/types.d.ts" />

function positiveGraceSeconds(value, fallback) {
  var number = Number(value)
  if (!isFinite(number) || Math.floor(number) !== number || number <= 0) return fallback
  return number
}

function shouldReleaseStalePending(registrationStatus, paymentStatus, paymentData, nowMs, graceSeconds) {
  if (String(registrationStatus || "") !== "pending") return false
  if (String(paymentStatus || "") !== "pending") return false
  if (!paymentData || typeof paymentData !== "object" || Array.isArray(paymentData)) return false
  if (String(paymentData.provider || "") !== "paygate") return false
  if (String(paymentData.providerStatus || "") !== "pending") return false

  var expiresAt = Date.parse(String(paymentData.expiresAt || ""))
  if (!isFinite(expiresAt)) return false

  var graceMs = positiveGraceSeconds(graceSeconds, 600) * 1000
  return Number(nowMs) > expiresAt + graceMs
}

module.exports = {
  shouldReleaseStalePending: shouldReleaseStalePending,
}
