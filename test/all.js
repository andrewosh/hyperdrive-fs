var proc = require('child_process')

var util = require('./util')
var test = require('tape')

test('should pass all libfuse tests', function (t) {
  util.checkLibfuse(function () {
    util.makeTestFilesystem(function (err, mntDir, filesystem) {
      t.error(err)
      var testProc = proc.spawn(util.fuseTestPath, [mntDir], {
        stdio: ['ignore', process.stdout, 'pipe']
      })
      testProc.on('close', function (code) {
        if (code === 0) t.pass('libfuse tests completed successfully')
        t.end()
      })
      testProc.stderr.setEncoding('utf8')
      var failureMessage = null
      testProc.stderr.on('data', function (data) {
        console.error(data)
        if (/.*tests failed/.test(data)) failureMessage = data
      })
      testProc.stderr.on('finish', function () {
        if (failureMessage) t.fail(failureMessage)
      })
    })
  })
})
