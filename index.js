var collect = require('stream-collector')
var fuse = require('fuse-bindings')
var pump = require('pump')
var mkdirp = require('mkdirp')
var debug = require('debug')

function createFilesystem (drive, mnt, opts, cb) {
  if (typeof opts === 'function') return module.exports(drive, mnt, null, opts)
  if (!opts) opts = {}

  var log = opts.log || debug('layerdrive-fs')
  var handlers = {}

  var ready = function () {
    function get (path, cb) {
      console.log('getting')
      return drive.stat(path, cb)
    }

    handlers.getattr = function (path, cb) {
      log('getattr', path)

      get(path, function (err, entry) {
        if (err) return cb(fuse.ENOENT)
        return cb(0, entry)
      })
    }

    handlers.readdir = function (path, cb) {
      log('readdir', path)
      return drive.readdir(path, function (err, files) {
        if (err) return cb(fuse.ENOENT)
        return cb(0, files)
      })
    }

    var files = []
    var open = function (path, flags, cb) {
      console.log('open:', path)
      var push = function (data) {
        var list = files[path] = files[path] || [true, true, true] // fd > 3
        var fd = list.indexOf(null)
        if (fd === -1) fd = list.length
        list[fd] = data
        cb(0, fd)
      }

      get(path, function (err, entry) {
        if (err) return cb(fuse.ENOENT)
        if (entry.type === 'symlink') return open(entry.linkname, flags, cb)
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

      return cb(0)
    }

    handlers.read = function (path, handle, buf, len, offset, cb) {
      log('read', path, offset, len, handle, buf.length)
      var list = files[path] || []
      var file = list[handle]
      if (!file) return cb(fuse.ENOENT)

      if (file.entry.length === 0) return cb(0)

      if (len + offset > file.entry.length) len = file.entry.length - offset

      if (file.fd === undefined) return

      var stream = drive.createReadStream({ start: offset, length: len })
      collect(stream, function (err, list) {
        if (err) return cb(fuse.EPERM)
        var offset = 0
        list.forEach(function (data) {
          data.copy(buf, offset)
          offset += data.length
        })
        return cb(offset)
      })
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
      if (file.fd === undefined) {
        console.error('write:fd  error')
        return cb(fuse.EPERM)
      }
      var stream = drive.createWriteStream({
        start: offset,
        flags: 'r+',
        defaultEncoding: 'binary'
      })
      stream.on('finish', function () {
        return cb(0)
      })
      stream.on('error', function () {
        return cb(fuse.EPERM)
      })
      stream.write(buf.slice(len))
    }

    handlers.unlink = function (path, cb) {
      log('unlink', path)
      // TODO: save a stat call?
      get(path, function (err, entry) {
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
      get(src, function (err, entry) {
        if (err) return cb(fuse.EPERM)
        pump(drive.createReadStream(src), drive.createWriteStream(dst),
          function (err) {
            if (err) return cb(fuse.EPERM)
            return cb(0)
          }
        )
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
      open(path, 2, cb)
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

    handlers.symlink = function (src, dest, cb) {
      log('symlink', src, dest)
      drive.symlink(src, dest, function (err) {
        if (err) return cb(err)
        return cb(0)
      })
    }

    handlers.readlink = function (path, cb) {
      log('readlink', path)
      get(path, function (err, entry) {
        if (err) return cb(err)
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
      return cb(null, handlers)
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
