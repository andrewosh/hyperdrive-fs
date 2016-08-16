var fs = require('fs')
var p = require('path')

var cuid = require('cuid')
var memdb = require('memdb')
var walk = require('walk').walk
var cow = require('..')
var stream = require('through2').obj

var fuseTestPath = p.join(__dirname, 'libfuse', 'test', 'test')
var testDir = p.join(__dirname, 'test-fs')

function makeTestFilesystem (opts, cb) {
  var mntDir = p.join(__dirname, 'mnt', cuid())
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  return cow(mntDir, Object.assign({
    dir: p.join(__dirname, 'test-store'),
    db: memdb(),
    createFileStream: function (entry, offset) {
      console.log('creating file streamL:', JSON.stringify(entry))
      return fs.createReadStream(p.join(testDir, entry.name), {
        start: offset || 0
      })
    },
    createIndexStream: function () {
      var s = stream()
      var walker = walk(testDir)
      function _updateName (root, entry) {
        return Object.assign({}, entry, {
          name: '/' + p.relative(testDir, p.resolve(p.join(root, entry.name))),
          length: entry.size
        })
      }
      walker.on('file', function (root, fileStat, next) {
        s.push(_updateName(root, fileStat))
        next()
      })
      walker.on('directory', function (root, dirStat, next) {
        s.push(_updateName(root, dirStat))
        next()
      })
      walker.on('end', function () {
        return s.destroy()
      })
      return s
    }
  }, opts), function (err, filesystem) {
    if (err) return cb(err)
    return cb(null, mntDir, filesystem)
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
