"use strict";

var Promise = require('bluebird')
  , models = require('../../../models')
  , exceptions = require('../../../support/exceptions')
  , PostSerializer = models.PostSerializer
  , FeedFactory = models.FeedFactory
  , pubSub = models.PubSub
  , ForbiddenException = exceptions.ForbiddenException
  , _ = require('lodash')

exports.addController = function(app) {
  /**
   * @constructor
   */
  var PostsController = function() {
  }

  PostsController.create = async function(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    var feeds = []
    req.body.meta = req.body.meta || {}

    if (_.isArray(req.body.meta.feeds)) {
      feeds = req.body.meta.feeds
    } else if (req.body.meta.feeds) {
      feeds = [req.body.meta.feeds]
    } else {
      res.status(401).jsonp({ err: 'Cannot publish post to /dev/null' })
      return
    }

    try {
      let promises = feeds.map(async (username) => {
        let feed = await FeedFactory.findByUsername(username)
        await feed.validateCanPost(req.user)

        // we are going to publish this message to posts feed if
        // it's my home feed or group's feed, otherwise this is a
        // private message that goes to its own feed(s)
        if (
          (feed.isUser() && feed.id == req.user.id) ||
          !feed.isUser()
        ) {
          return feed.getPostsTimelineId()
        } else {
          // private post goes to sendee and sender
          return await* [
            feed.getDirectsTimelineId(),
            req.user.getDirectsTimelineId()
          ]
        }
      })
      let timelineIds = _.flatten(await* promises)

      let newPost = await req.user.newPost({
        body: req.body.post.body,
        attachments: req.body.post.attachments,
        timelineIds: timelineIds
      })

      await newPost.create()

      let json = await new PostSerializer(newPost).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  PostsController.update = function(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    models.Post.findById(req.params.postId)
      .then(function(post) {
        if (req.user.isAnonymous()) {
          return Promise.reject(new ForbiddenException(
              "Anonymous can't update posts"))
        }

        if (post.userId != req.user.id) {
          return Promise.reject(new ForbiddenException(
              "You can't update another user's post"))
        }
        return post.update({
          body: req.body.post.body
        })
      })
      .then(function(post) {
        new PostSerializer(post).toJSON(function(err, json) {
          res.jsonp(json)
        })
      })
      .catch(exceptions.reportError(res))
  }

  PostsController.show = async function(req, res) {
    try {
      var userId = req.user ? req.user.id : null
      var post = await models.Post.getById(req.params.postId, {
        maxComments: req.query.maxComments,
        maxLikes: req.query.maxLikes,
        currentUser: userId
      })

      var valid = await post.validateCanShow(userId)

      // this is a private post
      if (!valid)
        throw new ForbiddenException("Not found")

      var author = await models.User.findById(post.userId)
      var banIds = await author.getBanIds()
      if (banIds.indexOf(post.currentUser) >= 0)
        throw new ForbiddenException("This user has prevented you from seeing their posts")

      var you = await models.User.findById(post.currentUser)
      if (you) {
        var yourBanIds = await you.getBanIds()
        if (yourBanIds.indexOf(author.id) >= 0)
          throw new ForbiddenException("You have blocked this user and do not want to see their posts")
      }

      var json = new PostSerializer(post).promiseToJSON()

      res.jsonp(await json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  PostsController.like = async function(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      let post = await models.Post.getById(req.params.postId)

      await req.user.validateCanLikePost(post)

      let affectedTimelines = await post.addLike(req.user)

      let stats = await models.Stats.findById(req.user.id)
      await stats.addLike()

      res.status(200).send({})

      await pubSub.newLike(post, req.user.id, affectedTimelines)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  PostsController.unlike = async function(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    try {
      let post = await models.Post.getById(req.params.postId)

      await req.user.validateCanUnLikePost(post)

      await post.removeLike(req.user.id)
      res.status(200).send({})
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  PostsController.destroy = async function(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    try {
      let post = await models.Post.getById(req.params.postId)

      await req.user.validateCanDestroyPost(post)

      await post.destroy()

      res.jsonp({})
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  PostsController.hide = async function(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    try {
      let post = await models.Post.getById(req.params.postId)
      await post.hide(req.user.id)

      res.jsonp({})
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  PostsController.unhide = async function(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    try {
      let post = await models.Post.getById(req.params.postId)
      await post.unhide(req.user.id)

      res.jsonp({})
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  return PostsController
}
