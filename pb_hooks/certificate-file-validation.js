function readPrefix(file, limit) {
  var reader = file.reader.open()
  try { return toBytes(reader, limit) || [] }
  finally { try { reader.close() } catch (_) {} }
}


function uint32be(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]
}

function pngInfo(bytes) {
  var magic = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24) return null
  for (var i = 0; i < magic.length; i++) if (bytes[i] !== magic[i]) return null
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return null
  return { format: "png", width: uint32be(bytes, 16), height: uint32be(bytes, 20) }
}

function jpegInfo(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  var i = 2
  var sof = [0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue }
    while (i < bytes.length && bytes[i] === 0xff) i++
    var marker = bytes[i++]
    if (marker === 0xd9 || marker === 0xda) break
    if (marker >= 0xd0 && marker <= 0xd7) continue
    if (i + 1 >= bytes.length) break
    var length = (bytes[i] << 8) + bytes[i + 1]
    if (length < 2 || i + length > bytes.length) break
    if (sof.indexOf(marker) !== -1 && length >= 7) {
      return { format: "jpeg", height: (bytes[i + 3] << 8) + bytes[i + 4], width: (bytes[i + 5] << 8) + bytes[i + 6] }
    }
    i += length
  }
  return null
}
function inspect(file) {
  if (!file || !file.reader) throw new Error("Invalid uploaded file")
  var bytes = readPrefix(file, Math.min(524288, Math.max(64, Number(file.size || 64))))
  var info = pngInfo(bytes) || jpegInfo(bytes)
  if (!info || !info.width || !info.height) throw new Error("Unsupported or malformed image file")
  info.size = Number(file.size || 0)
  return info
}

function validate(file, kind) {
  var info = inspect(file)
  var area = info.width * info.height
  if (kind === "renderBase") {
    if (info.format !== "png") throw new Error("Render base must be a PNG")
    if (info.size > 26214400) throw new Error("Render base exceeds 25 MB")
    if (info.width < 1000 || info.height < 700 || info.width > 6000 || info.height > 6000 || area > 24000000) {
      throw new Error("Render base dimensions are outside the supported range")
    }
  } else if (kind === "signature") {
    if (info.format !== "png") throw new Error("Signature image must be a PNG")
    if (info.size > 5242880) throw new Error("Signature image exceeds 5 MB")
    if (info.width < 40 || info.height < 20 || info.width > 4000 || info.height > 2000 || area > 8000000) {
      throw new Error("Signature image dimensions are outside the supported range")
    }
  } else if (kind === "background") {
    if (["png", "jpeg"].indexOf(info.format) === -1) throw new Error("Background must be PNG or JPEG in v1")
    if (info.size > 26214400) throw new Error("Background exceeds 25 MB")
    if (info.width < 1000 || info.height < 700 || info.width > 10000 || info.height > 10000 || area > 40000000) {
      throw new Error("Background dimensions are outside the supported range")
    }
  } else {
    throw new Error("Unknown certificate asset type")
  }
  return info
}

module.exports = { inspect: inspect, jpegInfo: jpegInfo, pngInfo: pngInfo, validate: validate }
