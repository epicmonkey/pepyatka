var uuid = require('node-uuid')
  , redis = require('redis')
  , models = require('../models')
  , async = require('async')
  , _ = require('underscore')

exports.addModel = function(db) {
  function Comment(params) {
    this.id = params.id
    this.body = params.body || ""
    this.postId = params.postId
    this.userId = params.userId

    if (parseInt(params.createdAt, 10))
      this.createdAt = parseInt(params.createdAt, 10)
    if (parseInt(params.updatedAt, 10))
      this.updatedAt = parseInt(params.updatedAt, 10)
  }

  Comment.getAttributes = function() {
    return ['id', 'body', 'postId', 'updatedAt', 'createdBy', 'createdAt']
  }

  Comment.findById = function(commentId, callback) {
    db.hgetall('comment:' + commentId, function(err, attrs) {
      if (!attrs || err)
        return callback(err, null)

      attrs.id = commentId
      var comment = new Comment(attrs)
      models.User.findById(attrs.userId, function(err, user) {
        comment.user = user
        callback(err, comment)
      })
    })
  }

  // TODO: commentId -> commentsId
  Comment.destroy = function(commentId, callback) {
    models.Comment.findById(commentId, function(err, comment) {
      models.Tag.extract(comment.body, function(err, tagsInfo) {
        models.Tag.diff(tagsInfo, {}, function(err, resultTagsInfo) {
          models.Tag.update(resultTagsInfo, function(err) {
            db.del('comment:' + commentId, function(err, res) {
              if (!comment)
                return callback(err, res)

              db.lrem('post:' + comment.postId + ':comments', 1, commentId, function(err, res) {
                var pub = redis.createClient();

                pub.publish('destroyComment', JSON.stringify({ postId: comment.postId,
                  commentId: commentId }))

                //TODO It's not the best way
                models.Post.findById(comment.postId, function(err, post) {
                  if (!post)
                    return callback(err, null)

                  post.getComments(function(err, comments) {
                    if (!comments)
                      return callback(err, null)

                    if (_.where(comments, { userId: comment.userId }).length !== 0)
                      return callback(err, null)

                    models.Stats.findByUserId(comment.userId, function(err, stats) {
                      if (!stats || err)
                        return callback(err, null)

                      stats.removeDiscussion(function(err, stats) {
                        callback(err, res)
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  }

  Comment.prototype = {
    validate: function(callback) {
      var that = this

      db.exists('user:' + that.userId, function(err, userExists) {
        db.exists('post:' + that.postId, function(err, postExists) {
          callback(postExists == 1 &&
                   userExists == 1 &&
                   that.body.trim().length > 0)
        })
      })
    },

    update: function(params, callback) {
      var that = this

      this.updatedAt = new Date().getTime()

      this.validate(function(valid) {
        if (!valid)
          return callback(1, that)

        db.exists('comment:' + that.id, function(err, res) {
          if (res !== 1)
            return callback(err, that)

          var newBody = ((params.body || "").slice(0, 8192) || that.body).toString().trim()
          models.Tag.extract(that.body, function(err, oldPostTagsInfo) {
            models.Tag.extract(newBody, function(err, newPostTagsInfo) {
              models.Tag.diff(oldPostTagsInfo, newPostTagsInfo, function(err, diffTagsInfo) {
                models.Tag.update(diffTagsInfo, function(err) {
                  db.hmset('comment:' + that.id,
                           { 'body': newBody,
                             'updatedAt': that.createdAt.toString()
                           }, function(err, res) {
                             // TODO: a bit mess here: update method calls
                             // pubsub event and Post.newComment calls
                             // them as well
                             var pub = redis.createClient();

                             pub.publish('updateComment', JSON.stringify({
                               postId: that.postId,
                               commentId: that.id
                             }))

                             models.Post.findById(that.postId, function(err, post) {
                               post.getSubscribedTimelinesIds(function(err, timelinesIds) {
                                 async.forEach(Object.keys(timelinesIds), function(timelineId, callback) {
                                   pub.publish('updateComment', JSON.stringify({
                                     timelineId: timelinesIds[timelineId],
                                     commentId: that.id
                                   }))

                                   callback(null)
                                 }, function(err) {
                                   callback(err)
                                 })
                               })
                             })
                           })
                })
              })
            })
          })
        })
      })
    },

    getCreatedBy: function(f) {
      this.user ? f(null, this.user) : models.User.findById(this.userId, f);
    },

    create: function(callback) {
      var that = this

      this.createdAt = new Date().getTime()
      this.updatedAt = new Date().getTime()
      this.id = uuid.v4()

      this.validate(function(valid) {
        if (!valid)
          return callback(1, that)

        db.exists('comment:' + that.id, function(err, res) {
          if (res !== 0)
            return callback(err, that)

          var commentBody = (that.body.slice(0, 8192) || "").toString().trim()
          db.hmset('comment:' + that.id,
                   { 'body': commentBody,
                     'createdAt': that.createdAt.toString(),
                     'updatedAt': that.createdAt.toString(),
                     'userId': that.userId.toString(),
                     'postId': that.postId.toString()
                   }, function(err, res) {
                     models.Post.addComment(that.postId, that.id, function() {
                       //TODO It's not the best way
                       models.Tag.extract(commentBody, function(err, result) {
                         models.Tag.update(result, function(err) {
                           models.Post.findById(that.postId, function(err, post) {
                             if (!post)
                               return callback(err, that)

                             post.getComments(function(err, comments) {
                               if (!comments)
                                 return callback(err, that)

                               if (_.where(comments, { userId: that.userId }).length !== 1)
                                 return callback(err, that)

                               models.Stats.findByUserId(that.userId, function(err, stats) {
                                 if (!stats)
                                   return callback(err, that)

                                 stats.addDiscussion(function(err, stats) {
                                   callback(err, that)
                                 })
                               })
                             })
                           })
                         })
                       })
                     })
                   })
        })
      })
    }
  }

  return Comment;
}
