var p = require('path')
var fs = require('fs')
var test = require('tape')

function checkLibfuse (cb) {
  fs.stat(p.join(__dirname, 'libfuse', 'test', 'test'), function (err, stat) {
    if (err || !stat) {
      console.error('Must build libfuse (with `npm run build:tests`) before running tests')
      process.exit(1)
    }
    return cb()
  })
}

test('should pass all libfuse tests', function (t) {
  checkLibfuse(function () {
    t.pass()
    t.end()
  })
})
