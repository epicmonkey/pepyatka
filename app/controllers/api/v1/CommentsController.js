"use strict";

import models, {CommentSerializer, pubSub} from '../../../models'
import exceptions, {ForbiddenException} from '../../../support/exceptions'

exports.addController = function(app) {
  class CommentsController {
    static async create(req, res) {
      if (!req.user)
        return res.status(401).jsonp({ err: 'Not found' })

      try {
        var valid = await req.user.validateCanComment(req.body.comment.postId)

        // this is a private post
        if (!valid)
          throw new ForbiddenException("Not found")

        var newComment = req.user.newComment({
          body: req.body.comment.body,
          postId: req.body.comment.postId
        })

        let timelines = await newComment.create()

        let json = await new CommentSerializer(newComment).promiseToJSON()
        res.jsonp(json)

        await pubSub.newComment(comment, timelines)
      } catch (e) {
        exceptions.reportError(res)(e)
      }
    }

    static async update(req, res) {
      if (!req.user)
        return res.status(401).jsonp({ err: 'Not found' })

      try {
        var comment = await models.Comment.getById(req.params.commentId)

        if (req.user.isAnonymous()) {
          throw new ForbiddenException("Anonymous can't update comments")
        }

        if (comment.userId != req.user.id) {
          throw new ForbiddenException(
            "You can't update another user's comment"
          )
        }

        await comment.update({
          body: req.body.comment.body
        })

        new CommentSerializer(comment).toJSON(function (err, json) {
          res.jsonp(json)
        })
      } catch (e) {
        exceptions.reportError(res)(e)
      }
    }

    static async destroy(req, res) {
      if (!req.user)
        return res.status(401).jsonp({ err: 'Not found' })

      try {
        var comment = await models.Comment.getById(req.params.commentId);

        if (req.user.isAnonymous()) {
          throw new ForbiddenException("Anonymous can't delete comments")
        }

        if (comment.userId != req.user.id) {
          throw new ForbiddenException(
            "You can't delete another user's comment"
          )
        }

        await comment.destroy()

        res.jsonp({})
      } catch (e) {
        exceptions.reportError(res)(e)
      }
    }
  }

  return CommentsController
}
