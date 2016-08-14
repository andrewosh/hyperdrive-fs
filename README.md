# copy-on-write
A copy-on-write, union filesystem implementation for NodeJS

Modified/extended from the FS implementation in [`torrent-docker`](https://github.com/mafintosh/torrent-docker)

**WIP** This is still in-progress. There are many FUSE implementation details that still need to
be added.

### install
Installation might currently be a pain because this module depends on `fuse-bindings` and might not
work by default on OSX. When it does work, install it with the standard:
```
npm install copy-on-write
```

### usage
```
require('copy-on-write')('/path/to/mountpoint', {
  createFileStream: function (entry, offset) {
    // Return the byte stream for the given entry (a readable stat object)
  }
  createIndexStream: function (cb) {
    // Return a stream of stat objects in the filesystem
  }
}, function (err, filesytem) {
  // Do stuff with the filesystem
}
```
#### createFilesystem (mnt, opts, function (err, fs))
Creates a filesystem instance, mounted at `mnt`
##### `opts`:
  1. `createImageStream(entry, offset)` - 
  2. `createIndexStream`
  3. (optional) `dir` - directory to store indices/layers
  3. (optional) `db` - LevelDB instance, default `level(dir)` by default
  4. (optional) `log` - logger, noop by default

### testing
Before running tests, make sure `scripts/get-libfuse.sh` is run (it will download/make the
libfuse tests, which is a fairly extensive suite of FUSE tests).
```
npm run build:tests
npm test
```

### license
MIT
