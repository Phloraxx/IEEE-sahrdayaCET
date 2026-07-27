/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest(function (e) {
  var value = e.record.getString("defaultWhatsappLink") || ""
  if (value && !/^https?:\/\//i.test(value)) {
    throw e.badRequestError("defaultWhatsappLink must start with http:// or https://")
  }
  e.next()
}, "societies")

onRecordUpdateRequest(function (e) {
  var value = e.record.getString("defaultWhatsappLink") || ""
  if (value && !/^https?:\/\//i.test(value)) {
    throw e.badRequestError("defaultWhatsappLink must start with http:// or https://")
  }
  e.next()
}, "societies")
