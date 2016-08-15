var lexint = require('lexicographic-integer')
var stream = require('stream')

function toIndexKey (name) {
  var depth = name.split('/').length - 1
  return lexint.pack(depth, 'hex') + name
}

function fromIndexKey (key) {
  return key.slice(2)
}

var empty = function () {
  var p = new stream.PassThrough()
  p.end()
  return p
}

module.exports = {
  toIndexKey: toIndexKey,
  fromIndexKey: fromIndexKey,
  empty: empty
}

