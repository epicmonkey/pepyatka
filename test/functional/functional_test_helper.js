"use strict";

var request = require('superagent')
    , app = require('../../index')
    , _ = require('lodash')

exports.flushDb = function() {
  return function(done) {
    $database.flushdbAsync()
        .then(function () {
          done()
        })
  }
}

exports.createUser = function(username, password, attributes, callback) {
  return function(done) {
    if (typeof attributes === 'function') {
      callback = attributes
      attributes = {}
    }

    if (typeof attributes === 'undefined')
      attributes = {}

    var user = {
      username: username,
      password: password
    }
    if (attributes.email)
      user.email = attributes.email

    request
      .post(app.config.host + '/v1/users')
      .send(user)
      .end(function(err, res) {
        if (callback) {
          var luna = res.body.users
          luna.password = user.password
          callback(res.body.authToken, luna)
        }
        done()
      })
  }
}

exports.createUserCtx = function(context, username, password, attrs) {
  return exports.createUser(username, password, attrs, function(token, user) {
    context.user      = user
    context.authToken = token
    context.username  = username.toLowerCase()
    context.password  = password
    context.attributes = attrs
  })
}

exports.subscribeToCtx = function(context, username) {
  return function(done) {
    request
      .post(app.config.host + '/v1/users/' + username + '/subscribe')
      .send({ authToken: context.authToken })
      .end(function(err, res) {
        done()
      })
  }
}

exports.updateUserCtx = function(context, attrs) {
  return function(done) {
    request
      .post(app.config.host + '/v1/users/' + context.user.id)
      .send({ authToken: context.authToken,
              user: { email: attrs.email },
              '_method': 'put' })
      .end(function(err, res) {
        done(err, res)
      })
  }
}

exports.sendResetPassword = function(email) {
  return function(done) {
    request
      .post(app.config.host + '/v1/passwords')
      .send({ email: email })
      .end(function(err, res) {
        done(err, res)
      })
  }
}

exports.resetPassword = function(token) {
  return function(done) {
    request
      .post(app.config.host + '/v1/passwords/token')
      .send({ '_method': 'put' })
      .end(function(err, res) {
        done(err, res)
      })
  }
}

exports.createPost = function(context, body, callback) {
  return function(done) {
    request
      .post(app.config.host + '/v1/posts')
      .send({ post: { body: body }, meta: { feeds: context.username }, authToken: context.authToken })
      .end(function(err, res) {
        context.post = res.body.posts
        if (typeof callback !== 'undefined')
          callback(context.post)

        done(err, res)
      })
  }
}

exports.createPostForTest = function(context, body, callback) {
  request
    .post(app.config.host + '/v1/posts')
    .send({ post: { body: body }, meta: { feeds: context.username }, authToken: context.authToken })
    .end(function(err, res) {
      context.post = res.body.posts
      callback(err, res)
    })
}

exports.createComment = function(body, postId, authToken, callback) {
  return function(done) {
    var comment = {
      body: body,
      postId: postId
    }

    request
      .post(app.config.host + '/v1/comments')
      .send({ comment: comment, authToken: authToken })
      .end(function(err, res) {
        done(err, res)
      })
  }(callback)
}

exports.createCommentCtx = function(context, body) {
  return function(done) {
    var comment = {
      body: body,
      postId: context.post.id
    }

    request
      .post(app.config.host + '/v1/comments')
      .send({ comment: comment, authToken: context.authToken })
      .end(function(err, res) {
        context.comment = res.body.comments
        done(err, res)
      })
  }
}

exports.removeComment = function(commentId, authToken, callback) {
  return function(done) {

    request
      .post(app.config.host + '/v1/comments/' + commentId)
      .send({
        authToken: authToken,
        '_method': 'delete'
      })
      .end(function(err, res) {
        done(err, res)
      })
  }(callback)
}

exports.getTimeline = function(timelinePath, authToken, callback) {
  return function(done) {
    var sendParams = {};
    if (authToken) {
      sendParams.authToken = authToken
    }
    request
      .get(app.config.host + timelinePath)
      .query(sendParams)
      .end(function(err, res) {
        done(err, res)
      })

  }(callback)
}

exports.getTimelinePaged = function(timelinePath, authToken, offset, limit, callback) {
  return function(done) {
    var sendParams = {};
    if (!_.isUndefined(authToken)) {
      sendParams.authToken = authToken
    }
    if (!_.isUndefined(offset)) {
      sendParams.offset = offset
    }
    if (!_.isUndefined(limit)) {
      sendParams.limit = limit
    }
    request
      .get(app.config.host + timelinePath)
      .query(sendParams)
      .end(function(err, res) {
        done(err, res)
      })

  }(callback)
}
