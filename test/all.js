var p = require('path')
var fs = require('fs')
var proc = require('child_process')

var cow = require('..')
var memdb = require('memdb')
var stream = require('through2').obj
var walk = require('walk').walk

var test = require('tape')

var fuseTestPath = p.join(__dirname, 'libfuse', 'test', 'test')
var testDir = p.join(__dirname, 'test-fs')

function makeTestFilesystem (cb) {
  return cow('./mnt', {
    dir: p.join(__dirname, 'test-store'),
    db: memdb(),
    createFileStream: function (entry, offset) {
      return fs.createReadStream(entry.name, {
        start: offset || 0
      })
    },
    createIndexStream: function () {
      var s = stream()
      var walker = walk(testDir)
      walker.on('file', function (root, fileStat, next) {
        s.push(fileStat)
        next()
      })
      walker.on('directory', function (root, dirStat, next) {
        s.push(dirStat)
        next()
      })
      return s
    }
  }, function (err, filesystem) {
    if (err) return cb(err)
    return cb(null, filesystem)
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

test('should pass all libfuse tests', function (t) {
  checkLibfuse(function () {
    makeTestFilesystem(function (err, filesystem) {
      t.error(err)
      console.log('fuseTestPath:', fuseTestPath)
      console.log('testDir:', testDir)
      var testProc = proc.spawn(fuseTestPath, [testDir])
      testProc.on('close', function () {
        t.end()
      })
      testProc.stderr.on('data', function (data) {
        t.fail('libfuse test produced error:', data)
      })
      t.pass()
    })
  })
})
