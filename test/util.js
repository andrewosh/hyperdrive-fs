var fs = require('fs')
var p = require('path')

var cuid = require('cuid')

var createLayerdrive = require('layerdrive/test').createLayerdrive
var createFilesystem = require('..')

var fuseTestPath = p.join(__dirname, 'libfuse', 'build', 'test', 'test_syscalls')
var testDir = p.join(__dirname, 'test-fs')

function makeTestFilesystem (opts, cb) {
  var mntDir = p.join(__dirname, 'mnt', cuid())
  createLayerdrive('alpine', 1, 1, 1, 100, function (err, drive, _, reference) {
    if (err) throw err
    return createFilesystem(drive, mntDir, opts, cb)
  })
}

function checkLibfuse (cb) {
  fs.stat(fuseTestPath, function (err, stat) {
    if (err || !stat) {
      console.error('Must build libfuse (with `npm run build:tests`) before running tests')
      process.exit(1)
    }
    return cb()
  })
}

module.exports = {
  makeTestFilesystem: makeTestFilesystem,
  checkLibfuse: checkLibfuse,
  fuseTestPath: fuseTestPath,
  testDir: testDir
}
