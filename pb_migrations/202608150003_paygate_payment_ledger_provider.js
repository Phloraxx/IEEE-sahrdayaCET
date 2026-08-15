/// <reference path="../pb_data/types.d.ts" />

// Extend the normalized payment ledger for the temporary Kotak/PayGate path.
// Historical PayGate rows stay `legacy_paygate`; only new temporary sessions
// use the first-class `paygate` provider.
migrate((app) => {
  const payments = app.findCollectionByNameOrId("payments")
  const provider = payments.fields.getByName("provider")
  if (provider) {
    provider.values = ["razorpay", "paygate", "manual", "legacy_paygate"]
  }
  const source = payments.fields.getByName("confirmationSource")
  if (source) {
    source.values = ["razorpay", "paygate", "admin", "legacy"]
  }
  app.save(payments)
}, (app) => {
  const payments = app.findCollectionByNameOrId("payments")
  const provider = payments.fields.getByName("provider")
  const source = payments.fields.getByName("confirmationSource")

  // A rollback must not invalidate records already created through Kotak.
  // Only narrow the selects when no first-class PayGate ledger rows exist.
  let paygateRows = []
  try {
    paygateRows = app.findRecordsByFilter(
      "payments", "provider = {:provider}", "", 1, 0, { provider: "paygate" },
    )
  } catch (_) {}
  if (!paygateRows.length) {
    if (provider) provider.values = ["razorpay", "manual", "legacy_paygate"]
    if (source) source.values = ["razorpay", "admin", "legacy"]
    app.save(payments)
  }
})
