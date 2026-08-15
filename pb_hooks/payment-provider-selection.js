/// <reference path="../pb_data/types.d.ts" />

var RAZORPAY = "razorpay"
var KOTAK = "kotak"

function eventProvider(event) {
  var value = event ? String(event.getString("paymentProvider") || "") : ""
  return value === KOTAK ? KOTAK : RAZORPAY
}

function paymentDataForEvent(event) {
  var selected = eventProvider(event)
  return {
    provider: selected === KOTAK ? "paygate" : "razorpay",
    eventPaymentProvider: selected,
    paymentAccount: selected === KOTAK ? "kotak" : "",
    providerStatus: "not_initialized",
    manualReview: false,
  }
}

module.exports = {
  RAZORPAY: RAZORPAY,
  KOTAK: KOTAK,
  eventProvider: eventProvider,
  paymentDataForEvent: paymentDataForEvent,
}
