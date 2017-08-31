var p = require('path')
var fuse = require('fuse-bindings')
var pump = require('pump')
var concat = require('concat-stream')
var mkdirp = require('mkdirp')
var debug = require('debug')

function createFilesystem (drive, mnt, opts, cb) {
  if (typeof opts === 'function') return module.exports(drive, mnt, null, opts)
  if (!opts) opts = {}

  var log = opts.log || debug('layerdrive-fs')
  var handlers = {}

  var ready = function () {
    function get (path, cb) {
      log('in get, path:', path)
      if (typeof opts === 'function') return get(path, {}, opts)
      drive.stat(path, { noFollow: true }, function (err, stat) {
        if (err) return cb(err)
        var error = new Error('not found')
        error.notFound = true
        console.log('in get, stat:', stat)
        console.log('in get, err:', err)
        if (!stat) return cb(error)
        return cb(null, stat)
      })
    }

    handlers.getattr = function (path, cb) {
      log('getattr', path)
      log('path length:', path.length)
      get(path, function (err, entry) {
        if (err) return cb(fuse.ENOENT)
        log('getattr:', entry)
        return cb(0, entry)
      })
    }

    handlers.readdir = function (path, cb) {
      log('readdir', path)
      return drive.readdir(path, function (err, files) {
        if (err) return cb(fuse.ENOENT)
        files = files.map(function (file) { return p.basename(file) })
        log('readdir files:', files)
        return cb(0, files)
      })
    }

    var files = []
    var open = function (path, flags, cb) {
      log('open:', path)
      var push = function (data) {
        var list = files[path] = files[path] || [true, true, true] // fd > 3
        var fd = list.indexOf(null)
        if (fd === -1) fd = list.length
        list[fd] = data
        log('in push, fd:', fd)
        cb(0, fd)
      }
      get(path, function (err, entry) {
        if (err) return cb(fuse.ENOENT)
        if (entry.linkname) return open(entry.linkname, flags, cb)
        log('calling push with entry:', entry)
        return push({offset: 0, entry: entry})
      })
    }

    handlers.open = function (path, flags, cb) {
      log('open', path, flags)
      return open(path, flags, cb)
    }

    handlers.release = function (path, handle, cb) {
      log('release', path, handle)

      var list = files[path] || []
      var file = list[handle]
      if (!file) return cb(fuse.ENOENT)
      list[handle] = null
      if (!list.length) delete files[path]

      log('release successful')
      return cb(0)
    }

    handlers.read = function (path, handle, buf, len, offset, cb) {
      log('read', path, offset, len, handle, buf.length)
      var list = files[path] || []
      var file = list[handle]
      if (!file) return cb(fuse.ENOENT)

      var end = Math.max(0, Math.min(file.entry.size - 1, offset + len))
      var stream = drive.createReadStream(path, { start: offset, end: end })
      pump(stream, concat({ encoding: 'buffer' }, gotContents), function (err) {
        if (err) return cb(fuse.EPERM)
      })
      function gotContents (contents) {
        log('contents:', contents)
        contents.copy(buf)
        return cb(contents.length)
      }
    }

    handlers.truncate = function (path, size, cb) {
      log('truncate', path, size)
      get(path, function (err, entry) {
        if (err) return cb(fuse.EPERM)
        var difference = size - entry.size
        if (difference === 0) return cb(0)
        if (difference < 0) return shorten(entry, Math.abs(difference))
        function shorten (entry, amount) {
          pump(drive.createReadStream(path, { end: entry.size - difference }),
               drive.createWriteStream(path),
            function (err) {
              if (err) return cb(fuse.EPERM)
              return cb(0)
            }
          )
        }
        function extend (entry, amount) {
          var stream = drive.createWriteStream(path, {
            start: entry.size,
            flags: 'r+',
            defaultEncoding: 'binary'
          })
          stream.on('finish', function () {
            return cb(0)
          })
          stream.on('error', function () {
            return cb(fuse.EPERM)
          })
          stream.write(Buffer.alloc(amount, '\0'))
        }
        return extend(entry, Math.abs(difference))
      })
    }

    handlers.write = function (path, handle, buf, len, offset, cb) {
      log('write', path, offset, len, handle)

      var list = files[path] || []
      var file = list[handle]
      if (!file) return cb(fuse.ENOENT)
      var stream = drive.createWriteStream(path, {
        start: offset,
        flags: 'r+',
        defaultEncoding: 'binary'
      })
      stream.on('finish', function () {
        file.offset = offset + len
        console.log('finished write, file:', file)
        return cb(len)
      })
      stream.on('error', function () {
        return cb(fuse.EPERM)
      })
      stream.write(buf.slice(0, len))
      stream.end()
    }

    handlers.unlink = function (path, cb) {
      log('unlink', path)
      // TODO: save a stat call?
      get(path, function (err, entry) {
        console.log('in unlink, err:', err)
        console.log('in unlink, entry:', entry)
        if (err) return cb(err)
        if (!entry) return cb(fuse.ENOENT)
        drive.unlink(path, function (err) {
          if (err) return cb(err)
          return cb(0)
        })
      })
    }

    handlers.rename = function (src, dst, cb) {
      log('rename', src, dst)
      drive.mv(src, dst, function (err) {
        if (err) return cb(err)
        files[dst] = files[src] || []
        return cb(0)
      })
    }

    handlers.mkdir = function (path, mode, cb) {
      log('mkdir', path)
      drive.mkdir(path, mode, function (err) {
        if (err) return cb(fuse.EPERM)
        return cb(0)
      })
    }

    handlers.rmdir = function (path, cb) {
      log('rmdir', path)
      drive.rmdir(path, function (err) {
        if (err) return cb(fuse.EPERM)
        return cb(0)
      })
    }

    handlers.chown = function (path, uid, gid, cb) {
      log('chown', path, uid, gid)
      drive.chown(path, uid, gid, function (err) {
        if (err) return cb(fuse.EPERM)
        return cb(0)
      })
    }

    handlers.chmod = function (path, mode, cb) {
      log('chmod', path, mode)
      drive.chmod(path, mode, function (err) {
        if (err) return cb(fuse.EPERM)
        return cb(0)
      })
    }

    handlers.create = function (path, mode, cb) {
      log('create', path, mode)
      drive.append(path, '', function (err) {
        if (err) return cb(fuse.EPERM)
        drive.chmod(path, mode, function (err) {
          if (err) return cb(fuse.EPERM)
          return open(path, mode, cb)
        })
      })
    }

    handlers.getxattr = function (path, name, buffer, length, offset, cb) {
      log('getxattr')
      cb(0)
    }

    handlers.setxattr = function (path, name, buffer, length, offset, flags, cb) {
      log('setxattr')
      cb(0)
    }

    handlers.statfs = function (path, cb) {
      cb(0, {
        bsize: 1000000,
        frsize: 1000000,
        blocks: 1000000,
        bfree: 1000000,
        bavail: 1000000,
        files: 1000000,
        ffree: 1000000,
        favail: 1000000,
        fsid: 1000000,
        flag: 1000000,
        namemax: 1000000
      })
    }

    handlers.utimens = function (path, actime, modtime, cb) {
      log('utimens', path, actime, modtime)
      get(path, function (err, entry) {
        if (err) return cb(fuse.ENOENT)
        entry.atim = actime.getTime()
        entry.mtim = modtime.getTime()
        drive.updateStat(path, entry, function (err) {
          if (err) return cb(err)
          return cb(0)
        })
      })
    }

    handlers.mknod = function (path, mode, dev, cb) {
      log('mknod', path, mode, dev)
      drive.mknod(path, mode, dev, function (err) {
        if (err) return cb(err)
        return cb(0)
      })
    }

    var processSrc = function (src) {
      if (src.startsWith(mnt)) {
        src = src.slice(mnt.length)
      }
      if (!src.startsWith('/')) src = '/' + src
      return src
    }

    handlers.symlink = function (src, dest, cb) {
      src = processSrc(src)
      log('symlink', src, dest)
      get(dest, function (err, entry) {
        if (err && !err.notFound) return cb(err)
        if (entry) return cb(fuse.EEXIST)
        drive.symlink(src, dest, function (err) {
          console.log('symlink error:', err)
          if (err) return cb(err)
          files[dest] = files[src] || []
          return cb(0)
        })
      })
    }

    handlers.readlink = function (path, cb) {
      log('readlink', path)
      get(path, function (err, entry) {
        if (err) return cb(err)
        console.log('in readlink, entry.linkname:', entry.linkname)
        return cb(0, entry.linkname)
      })
    }

    handlers.link = function (src, dest, cb) {
      log('link', src, dest)
      drive.link(src, dest, function (err) {
        if (err) return cb(err)
        return cb(0)
      })
    }

    handlers.destroy = function (cb) {
      return cb(0)
    }

    // handlers.options = ['allow_other', 'debug']
    fuse.mount(mnt, handlers, function (err) {
      if (err) return cb(err)
      console.log('MOUNTED!')
      return cb(null, mnt, handlers)
    })
  }

  mkdirp(mnt, function (err) {
    if (err) return cb(err)
    return ready()
  })
  process.on('SIGINT', function () {
    fuse.unmount(mnt, function (err) {
      if (err) console.error(err)
    })
  })
}

module.exports = createFilesystem
