var uuid = require('node-uuid')
  , models = require('../models')
  , async = require('async')
  , util = require('util')
  , _ = require("underscore")
  , mkKey = require("../support/models").mkKey
  , crypto = require('crypto')
  , Serializer = models.Serializer;

var groupK = "user";
var infoK = "info";
var rssK = "rss";
var timelinesK = "timelines";

var AdminSerializer = new Serializer({ select: ['id', 'username'] });

exports.addModel = function(db) {
  var statisticsSerializer = {
    select: ['userId', 'posts', 'likes', 'discussions', 'subscribers', 'subscriptions']
  }

  function Group(params) {
//    Group.super_.call(this, params);
    this.id = params.id
    this.username = params.username
    this.createdAt = params.createdAt
    this.updatedAt = params.updatedAt
    this.admins = params.admins
    this.type = "group"
  }

  util.inherits(Group, models.User)

  Group.getAttributes = function() {
    return ['id', 'username', 'subscribers', 'createdAt', 'updatedAt', 'admins', 'type']
  }

  Group.findById = function(groupId, callback) {
    db.hgetall('user:' + groupId, function(err, attrs) {
      if (attrs === null)
        return callback(1, null)

      attrs.id = groupId
      var newGroup = new Group(attrs)

      callback(err, newGroup)
    })
  }

  Group.destroy = function(groupId, callback) {
    // FIXME: this function does not clean stats for a group
    var destroyAllPosts = function(group, callback) {
      group.getPostsTimeline({start: 0}, function(err, timeline) {
        if (err)
          return callback(err)

        var deletePartOfPosts = function(start, count) {
          timeline.getPostsIds(start, count, function(err, postsIds) {
            if (err)
              return callback(err)

            async.forEach(postsIds, function(postId, done) {
                models.Post.destroy(postId, function(err) {
                  done(err)
                })
              },
              function(err) {
                if (postsIds.length < 25)
                  return callback(err)

                deletePartOfPosts(start + count, count)
              })
          })
        }(0, 25)
      })
    }

    var unsubscribeAllUsers = function(group, callback) {
      group.getPostsTimeline({start: 0}, function(err, timeline) {
        if (err)
          return callback(err)

        timeline.getSubscribers(function(err, subscribers) {
          if (err)
            return callback(err)

          async.forEach(subscribers, function(subscriber, done) {
              subscriber.unsubscribeTo(timeline.id, function(err) {
                done(err)
              })
            },
            function(err) {
              callback(err)
            })
        })
      })
    }

    var destroyAllTimelines = function(group, callback) {
      group.getTimelinesIds(function(err, timelinesIds) {
        if (err)
          return callback(err)

        var ids = []
        for (var id in timelinesIds) {
          ids.push(timelinesIds[id])
        }

        async.forEach(ids, function(timelineId, done) {
          db.keys('timeline:' + timelineId + '*', function(err, keys) {
            async.forEach(keys, function(key, done) {
              db.del(key, function(err, res) {
                done(err)
              })
            }, function(err) {
              done(err)
            })
          })
        }, function(err) {
          callback(err)
        })
      })
    }

    var deleteStats = function(group, callback) {
      db.del('stats:' + group.id, function(err, res) {
        callback(err)
      })
    }

    var deleteGroup = function(group, callback) {
      async.parallel([
        function(done) {
          db.keys('user:' + group.id + '*', function(err, keys) {
            async.forEach(keys, function(key, done) {
              db.del(key, function(err, res) {
                done(err)
              })
            },
            function(err) {
              done(err)
            })
          })
        },
        function(done) {
          db.del('username:' + group.username + ':uid', function(err, res) {
            done(err)
          })
        }],
        function(err) {
          callback(err)
        })
    }

    models.User.findById(groupId, function(err, group) {
      if (err)
        return callback(err)

      unsubscribeAllUsers(group, function(err) {
        if (err)
          return callback(err)

        destroyAllPosts(group, function(err) {
          if (err)
            return callback(err)

          async.parallel([
            function(done) {
              destroyAllTimelines(group, function(err) {
                if (err)
                  return done(err)

                deleteGroup(group, done)
              })
          },
          function(done) {
            deleteStats(group, done)
          }],
          function(err) {
            callback(err)
          })
        })
      })
    })
  }

  Group.prototype.validate = function(callback) {
    var that = this

    // TODO: review this code
    async.parallel([
      function(done) {
        db.exists('user:' + this.id, function(err, groupExists) {
          done(err, groupExists === 0 &&
                   that.username && that.username.length > 1)
        })
      },
      function(done) {
        db.exists('username:' + that.username + ':uid', function(err, usernameExists) {
          done(err, usernameExists === 0 &&
            that.username && that.username.length > 1)
        })
      }],
      function(err, res) {
        callback(res.indexOf(false) == -1)
      })
  }

  // TODO: review design on passing ownerId as a parameter
  Group.prototype.create = function(ownerId, callback) {
    var that = this

    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()
    this.id = uuid.v4()

    var subscribeOwner = function(callback) {
      models.FeedFactory.findById(that.id, function(err, groupFeed) {
        groupFeed.getPostsTimelineId(function(err, timelineId) {
          models.FeedFactory.findById(ownerId, function(err, ownerFeed) {
            ownerFeed.subscribeTo(timelineId, function(err, res) {
              callback(err, res)
            })
          })
        })
      })
    }

    this.validate(function(valid) {
      if (!valid)
        return callback(1, that)

      db.exists('user:' + that.id, function(err, res) {
        if (res !== 0)
          return callback(err, res)

        async.parallel([
          function(done) {
            db.hmset('user:' + that.id,
              { 'username': that.username,
                'createdAt': that.createdAt.toString(),
                'updatedAt': that.updatedAt.toString(),
                'type': that.type
              }, function(err, res) {
                  done(err, res)
              })
          },
          function(done) {
            db.set('username:' + that.username + ':uid', that.id, function(err, res) {
              done(err, res)
            })
          },
          function(done) {
            db.hmset('user:' + that.id + ':info',
                     { 'screenName': that.username.toString().trim()
                     }, function(err, res) {
                       done(err, res)
                     })
          },
          function(done) {
            var stats = new models.Stats({
              userId: that.id
            })
            stats.create(function(err, stats) {
              done(err, stats)
            })
          },
          function(done) {
            db.zadd('user:' + that.id + ':administrators', new Date().getTime().toString(), ownerId, function(err, res) {
              done(err, res)
            })
          }
        ], function(err, res) {
          subscribeOwner(function(err, res) {
            callback(err, that)
          })
        })
      })
    })
  }

  Group.prototype.setBaseAttrs = function(attrs, f) {
    db.hmset(mkKey([groupK, this.id]), {
      "updatedAt": attrs.updatedAt.toString()
    }, f);
  };

  Group.prototype.setInfo = function(attrs, f) {
    db.hmset(mkKey([groupK, this.id, infoK]), {
      "screenName": attrs.screenName ? attrs.screenName.trim() : ""
    }, f);
  };

  Group.prototype.cleanRSS = function(nrss, f) {
    var group = this;

    group.getRss(function(err, rss) {
      if (err) {
        f(err);
      } else {
        var diff = _.difference(rss, nrss);
        if (diff.length != 0) {
          models.RSS.removeUser(diff, group, function(err) {
            db.del(mkKey([groupK, group.id, rssK]), function(err, res) {
              f(err);
            });
          });
        } else {
          f(false, null);
        }
      }
    });
  };

  Group.prototype.addRSS = function(rss, f) {
    var group = this;

    async.map(rss, function(url, done) {
      models.RSS.addUserOrCreate({
        url: url,
        userId: group.id
      }, function(err, rss) {
        if (!err && rss) {
          done(err, rss.url);
        } else {
          done(err, null);
        }
      });
    }, function(err, res) {
      if (!err && res) {
        db.sadd(mkKey([groupK, group.id, rssK]), res, function(err, res) {
          f(err, res);
        });
      } else {
        f(err, null);
      }
    });
  };

  Group.prototype.newPost = function(attrs, f) {
    var group = this;

    group._getPostsTimelineId(function(err, id) {
      attrs.userId = group.id;
      attrs.timelineIds = [id];
      f(err, new models.Post(attrs));
    });
  };

  Group.prototype.getRiverOfNewsId = function(f) {
    f(null,null);
  };

  Group.prototype._getPostsTimelineId = function(f) {
    this._getTimelinesIds(function(err, timelines) {
      f(err, timelines.Posts);
    });
  };

  Group.prototype._getTimelinesIds = function(f) {
    db.hgetall(mkKey([groupK, this.id, timelinesK]), function(err, timelines) {
      f(err, timelines || []);
    });
  };

  Group.prototype.update = function(attrs, f) {
    var group = this;
    var callback = function(done) {
      return function(err, res) {
        done(err, res);
      };
    };

    group.updatedAt = new Date().getTime();

    var setBaseAttrs = function(done) {
      group.setBaseAttrs(group, callback(done));
    };

    var setRSS = function(done) {
      group.cleanRSS(attrs.rss, function(err, res) {
        if (attrs.rss) {
          group.addRSS(attrs.rss, done);
        } else {
          done(err, res);
        }
      });
    };

    var setInfo = function(done) {
      group.setInfo(attrs, callback(done));
    };

    var jobs = [setBaseAttrs, setInfo, setRSS];

    group.validate(function(err) {
      if (!err) {
        async.parallel(jobs, function(err, res) {
          f(err, group);
        });
      } else {
        f(err, null);
      }
    });
  };

  Group.prototype.getAdministratorsIds = function(callback) {
    var that = this

    db.zrevrange('user:' + that.id + ':administrators', 0, -1, function(err, res) {
      callback(err, res)
    })
  }

  Group.prototype.addAdministrator = function(feedId, callback) {
    var that = this

    db.zadd('user:' + that.id + ':administrators', new Date().getTime().toString(), feedId, function(err, res) {
      callback(err, res)
    })
  }

  Group.prototype.getAdmins = function(f) {
    this.getAdministratorsIds(function(err, administratorsIds) {
      async.map(administratorsIds, function(administratorId, callback) {
        models.FeedFactory.findById(administratorId, function(err, user) {
          if (!user) return callback(1, null);

          new AdminSerializer(user).toJSON(function(err, json) {
            callback(err, json);
          });
        });
      }, function(err, administratorsJSON) {
        f(err, administratorsJSON);
      });
    });
  },

  Group.prototype.removeAdministrator = function(feedId, callback) {
    var that = this

    that.getAdministratorsIds(function(err, administratorsIds) {
      if (err)
        return callback(err)

      if (administratorsIds.indexOf(feedId) == -1)
        return callback(null)

      if (administratorsIds.length === 1)
        return callback(1)

      db.zrem('user:' + that.id + ':administrators', feedId, function(err, res) {
        callback(err, res)
      })
    })
  }

  return Group;
}
