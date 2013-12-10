var uuid = require('node-uuid')
  , gm = require('gm')
  , mime = require('mime')
  , path = require('path')
  // XXX: do not like the idea of requiring all the models than we
  // need just one or may be two of them, however it's a oneliner.
  , models = require('../models')
  , fs = require('fs')

exports.addModel = function(db) {
  function Attachment(params) {
    this.id = params.id
    this.mimeType = params.mimeType // TODO: mmmagic lib
    this.mediaType = params.mediaType || "general"  // general kind of media: general, image, audio, video, etc
    this.ext = params.ext
    this.filename = params.filename || ""
    this.path = params.path || ""
    this.fsPath = params.fsPath || ""
    this.postId = params.postId
    this.tmpPath = params.tmpPath || ""

    if (parseInt(params.createdAt, 10))
      this.createdAt = parseInt(params.createdAt, 10)
    if (parseInt(params.updatedAt, 10))
      this.updatedAt = parseInt(params.updatedAt, 10)

    if (params.thumbnailId)
      this.thumbnailId = params.thumbnailId
  }

  Attachment.findById = function(attachmentId, callback) {
    db.hgetall('attachment:' + attachmentId, function(err, attrs) {
      if (attrs) {
        attrs.id = attachmentId;
        callback(err, new Attachment(attrs));
      } else {
        // XXX: if (!this.thumbnailId) return callback(null, attrs)
        // Similar thing here but for abstract serializer.
        callback(err, {});
      }
    })
  },

  // TODO: attachmentId -> attachmentsId
  Attachment.destroy = function(attachmentId, callback) {
    models.Attachment.findById(attachmentId, function(err, attachment) {
      if (!attachment.fsPath)
        return callback(err, null)

      fs.unlink(attachment.fsPath, function(err) {
        db.del('attachment:' + attachment.id, function(err, res) {
          callback(err, res)
        })
      })
    })
  }

  Attachment.prototype = {
    validate: function(callback) {
      var that = this

      db.exists('post:' + that.postId, function(err, postExists) {
        db.exists('attachment' + that.id, function(err, attachmentExists) {
          // TODO: dirty. we do an extra request to our db
          callback((postExists === 1 || that.postId === undefined) &&
                   attachmentExists === 0 &&
                   that.filename.trim().length > 0 &&
                   that.path.trim().length > 0 &&
                   that.fsPath.trim().length > 0)

        })
      })
    },

    handleMedia: function(tmpPath, callback) {
      var that = this

      var _handleImage = function() {
        // try to create thumbnail
        gm(tmpPath).format(function(err, value) {
          if (err) {
            // throw new Error(err)
            return _handleGeneral();
          }

          var thumbnailId = uuid.v4()
          var thumbnailPath = path.normalize(__dirname + '/../../public/files/' + thumbnailId + '.' + that.ext)
          var thumbnailHttpPath = '/files/' + thumbnailId + '.' + that.ext

          that.mediaType = "image"

          gm(tmpPath).size(function(err, size) {
            // check if we need to resize thumbnail
            if (size !== undefined && (size.width > 200)) {
              gm(tmpPath)
                .resize('200', '200')
                .write(thumbnailPath, function(err) {
                  if (err) {
                    // throw new Error(err)
                    return _handleGeneral()
                  }

                  var newThumbnail = new models.Attachment({
                    'id': thumbnailId,
                    'ext': that.ext,
                    'filename': that.filename,
                    'path': thumbnailHttpPath,
                    'fsPath': thumbnailPath
                  })

                  newThumbnail.save(thumbnailPath, function(err, thumbnail) {
                    // thumbnail stored and we're happy with it
                    that.thumbnailId = thumbnail.id
                    callback(err, that)
                  })
                })
            } else {
              // just set self as thumbnail
              that.thumbnailId = that.id
              callback(err, that)
            }
          });
        })

      }; // end image handling

      var _handleAudio = function() {
        that.mediaType = "audio"
        callback(null, that)
      }; // end audio handling

      var _handleGeneral = function() {
          // default attachment
        that.mediaType = "general"
        callback(null, that)
      };

      var mimetype = mime.lookup(this.filename)
      if (mimetype === "image/jpeg" ||
          mimetype === "image/gif" ||
          mimetype === "image/png" ||
          mimetype === "image/bmp") {
        _handleImage()
      } else if (mimetype === "audio/mpeg" ||
                 mimetype === "audio/ogg" ||
                 mimetype === "audio/x-wav") {
        _handleAudio()
      } else {
        _handleGeneral()
      };
    },

    save: function(tmpPath, callback) {
      var that = this

      if (this.id === undefined) this.id = uuid.v4()

      this.handleMedia(tmpPath, function(err) {
        var params = { 'ext': that.ext.toString(),
                       'filename': that.filename.toString(),
                       'path': that.path.toString(),
                       'fsPath': that.fsPath.toString(),
                       'mediaType': that.mediaType.toString()
                     }

        if (that.thumbnailId) {
          that.thumbnailId = that.thumbnailId.toString()
          params.thumbnailId = that.thumbnailId
        }

        if (that.postId) {
          that.postId = that.postId.toString()
          params.postId = that.postId.toString()
        }

        that.validate(function(valid) {
          if (!valid)
            return callback(1, that)

          db.hmset('attachment:' + that.id, params, function(err, res) {
            if (!that.postId)
              return callback(null, that)

            models.Post.addAttachment(that.postId, that.id, function(err, count) {
              callback(err, that)
            })
          })
        })
      })
    },

    getThumbnail: function(f) {
      models.Attachment.findById(this.thumbnailId, function(err, thumbnail) {
        f(err, {
          id: thumbnail.id,
          // ext: thumbnail.ext,
          // filename: thumbnail.filename,
          path: thumbnail.path
        });
      });
    },

    getMedia: function(f) {
      f(null, this.mediaType);
    }
  }

  return Attachment;
}
