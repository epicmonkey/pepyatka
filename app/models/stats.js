var uuid = require('node-uuid')
  , fs = require('fs')
  , gm = require('gm')
  , path = require('path')
  , models = require('../models')
  , async = require('async')
  , redis = require('redis')
  , _ = require('underscore')
  , configLocal = require('../../conf/envLocal.js')

exports.addModel = function(db) {
  function Stats(params) {
    this.userId = params.userId
    this.posts = params.posts || 0
    this.likes = params.likes || 0
    this.discussions = params.discussions || 0
    this.subscribers = params.subscribers || 0
    this.subscriptions = params.subscriptions || 0
  }

  Stats.getAttributes = function() {
    return ['userId', 'posts', 'likes', 'discussions', 'subscribers', 'subscriptions']
  }

  Stats.findByUserId = function(userId, callback) {
    db.hgetall('stats:' + userId, function(err, attrs) {
      if (!attrs || err)
        return callback(err, null)

      attrs.userId = userId

      callback(err, new Stats(attrs))
    })
  }


  //category is 'likes', 'posts', etc
  Stats.getTopUserIds = function(category, callback) {
    db.zrevrange('stats:' + category, 0, configLocal.getStatisticsTopCount(), function(err, userIds) {
      callback(err, userIds)
    })
  }

  Stats.getTopUserIdsWithScores = function(category, callback) {
    db.zrevrange('stats:' + category, 0, configLocal.getStatisticsTopCount(), 'WITHSCORES', function(err, userIds) {
      callback(err, userIds)
    })
  }

  Stats.prototype = {
    validate: function(callback) {
      var that = this

      db.exists('user:' + that.userId, function(err, userExists) {
        callback(userExists == 1)
      })
    },

    create: function(callback) {
      var that = this
      this.validate(function(valid) {
        if (!valid)
          return callback(1, that)

        async.parallel([
          function(done) {
            db.exists('stats:' + that.userId, function(err, res) {
              if (res !== 0)
                return done(err, res)

              db.hmset('stats:' + that.userId, {
                'posts' : that.posts.toString(),
                'likes' : that.likes.toString(),
                'discussions' : that.discussions.toString(),
                'subscribers' : that.subscribers.toString(),
                'subscriptions' : that.subscriptions.toString()
              }, function(err, res) {
                done(err, res)
              })
            })
          },
          function(done) {
            db.zadd('stats:likes', that.likes, that.userId, function(err, res) {
              done(err, res)
            })
          },
          function(done) {
            db.zadd('stats:posts', that.posts, that.userId, function(err, res) {
              done(err, res)
            })
          },
          function(done) {
            db.zadd('stats:discussions', that.discussions, that.userId, function(err, res) {
              done(err, res)
            })
          },
          function(done) {
            db.zadd('stats:subscribers', that.subscribers, that.userId, function(err, res) {
              done(err, res)
            })
          },
          function(done) {
            db.zadd('stats:subscriptions', that.subscriptions, that.userId, function(err, res) {
              done(err, res)
            })
          }
        ], function(err, res) {
          callback(err, that)
        })
      })
    },

    addPost: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'posts', '1', function(err, stats) {
        db.zincrby('stats:posts', 1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    },

    removePost: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'posts', '-1', function(err, stats) {
        db.zincrby('stats:posts', -1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    },

    addLike: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'likes', '1', function(err, stats) {
        db.zincrby('stats:likes', 1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    },

    removeLike: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'likes', '-1', function(err, stats) {
        db.zincrby('stats:likes', -1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    },

    addDiscussion: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'discussions', '1', function(err, stats) {
        db.zincrby('stats:discussions', 1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    },

    removeDiscussion: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'discussions', '-1', function(err, stats) {
        db.zincrby('stats:discussions', -1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    },

    addSubscriber: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'subscribers', '1', function(err, stats) {
        db.zincrby('stats:subscribers', 1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    },

    removeSubscriber: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'subscribers', '-1', function(err, stats) {
        db.zincrby('stats:subscribers', -1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    },

    addSubscription: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'subscriptions', '1', function(err, stats) {
        db.zincrby('stats:subscriptions', 1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    },

    removeSubscription: function(callback) {
      var that = this
      db.hincrby('stats:' + that.userId, 'subscriptions', '-1', function(err, stats) {
        db.zincrby('stats:subscriptions', -1, that.userId, function(err, stats) {
          callback(err, stats)
        })
      })
    }
  }

  return Stats
}
