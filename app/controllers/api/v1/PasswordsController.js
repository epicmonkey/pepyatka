"use strict";

var models = require('../../../models')
  , exceptions = require('../../../support/exceptions')

exports.addController = function(app) {
  var PasswordsController = function() {
  }

  PasswordsController.create = function(req, res) {
    var email = req.body.email

    if (email == null || email.length == 0) {
      return res.jsonp({ err: "Email cannot be blank" })
    }

    models.User.findByEmail(email)
      .then(function(user) { return user.updateResetPasswordToken() })
      .then(function(token) { res.jsonp({})} )
      .catch(exceptions.reportError(res))
  }

  PasswordsController.update = function(req, res) {
    var token = req.params.resetPasswordToken

    if (token == null || token.length == 0) {
      return res.jsonp({ err: "Token cannot be blank" })
    }

    models.User.findByResetToken(token).bind({})
      .then(function(user) {
        this.user = user
        return user.updatePassword(req.body.newPassword, req.body.passwordConfirmation)
      })
      .then(function() { this.user.updateResetPasswordToken() })
      .then(function(user) { res.jsonp({}) })
      .catch(exceptions.reportError(res))
  }

  return PasswordsController
}

