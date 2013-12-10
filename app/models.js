var redis = require('../db')
  , db = redis.connect()

exports.AbstractSerializer = require('./serializers/abstract_serializer').addSerializer();
exports.Serializer = require("./serializers/serializer").addSerializer();

exports.User        = require('./models/user').addModel(db);
exports.Group       = require('./models/group').addModel(db);
exports.Post        = require('./models/post').addModel(db);
exports.Comment     = require('./models/comment').addModel(db);
exports.Timeline    = require('./models/timeline').addModel(db);
exports.Attachment  = require('./models/attachment').addModel(db);
exports.Tag         = require('./models/tag').addModel(db);
exports.Stats       = require('./models/stats').addModel(db);
exports.RSS         = require('./models/rss').addModel(db);
exports.FeedFactory = require('./models/feed-factory').addModel(db);

exports.UserSerializer = require('./serializers/user_serializer').addSerializer(exports.User);
exports.CommentSerializer = require("./serializers/comment_serializer").addSerializer();
exports.SubscriptionSerializer = require("./serializers/subscription_serializer").addSerializer();
exports.SubscriberSerializer = require("./serializers/subscriber_serializer").addSerializer();
exports.PubSubNewPostSerializer = require("./serializers/pubsub_new_post_serializer").addSerializer();
exports.PubSubUpdatePostSerializer = require("./serializers/pubsub_update_post_serializer").addSerializer();
exports.PubSubCommentSerializer = require("./serializers/pubsub_comment_serializer").addSerializer();
exports.PubSubLikeSerializer = require("./serializers/pubsub_like_serializer").addSerializer();
exports.FeedInfoSerializer = require("./serializers/feedinfo_serializer").addSerializer();
exports.AttachmentSerializer = require("./serializers/attachment_serializer").addSerializer();
exports.PostSerializer = require('./serializers/post_serializer').addSerializer(exports.Post);
exports.TimelineSerializer = require("./serializers/timeline_serializer").addSerializer();
