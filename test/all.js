var proc = require('child_process')

var util = require('./util')
var test = require('tape')

test('should pass all libfuse tests', function (t) {
  util.checkLibfuse(function () {
    util.makeTestFilesystem(function (err, mntDir, filesystem) {
      t.error(err)
      var testProc = proc.spawn(util.fuseTestPath, [mntDir])
      testProc.on('exit', function (code) {
        if (code === 0) test.pass('libfuse tests completed successfully')
        t.end()
      })
      testProc.stderr.setEncoding('utf8')
      testProc.stderr.on('data', function (data) {
        if (/.*tests failed$/.test(data)) t.fail(data)
      })
    })
  })
})
