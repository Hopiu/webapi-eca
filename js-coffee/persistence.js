// Generated by CoffeeScript 1.7.1

/*

Persistence
============
> Handles the connection to the database and provides functionalities for
> event pollers, action invokers, rules and the encrypted storing of authentication tokens.
> General functionality as a wrapper for the module holds initialization,
> encryption/decryption, the retrieval of modules and shut down.
> 
> The general structure for linked data is that the key is stored in a set.
> By fetching all set entries we can then fetch all elements, which is
> automated in this function.
> For example, modules of the same group, e.g. action invokers are registered in an
> unordered set in the database, from where they can be retrieved again. For example
> a new action invoker has its ID (e.g 'probinder') first registered in the set
> 'action-invokers' and then stored in the db with the key 'action-invoker:' + ID
> (e.g. action-invoker:probinder). 
>
 */

(function() {
  var IndexedModules, crypto, crypto_key, decrypt, encrypt, exports, getSetRecords, hash, redis, replyHandler,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  crypto = require('crypto-js');

  redis = require('redis');

  crypto_key = "}f6y1y}B{.an$}2c$Yl.$mSnF\\HX149u*y8C:@kmN/520Gt\\v'+KFBnQ!\\r<>5X/xRI`sT<Iw;:DPV;4gy:qf]Zq{\"6sgK{,}^\"!]O;qBM3G?]h_`Psw=b6bVXKXry7*";


  /*
  Module call
  -----------
  Initializes the DB connection with the given `db-port` property in the `args` object.
  
  @param {Object} args
   */

  exports = module.exports = (function(_this) {
    return function(args) {
      if (!_this.db) {
        if (!args['db-port']) {
          args['db-port'] = 6379;
        }
        _this.log = args.logger;
        exports.eventPollers = new IndexedModules('event-poller', _this.log);
        exports.actionInvokers = new IndexedModules('action-invoker', _this.log);
        return exports.initPort(args['db-port']);
      }
    };
  })(this);

  exports.initPort = (function(_this) {
    return function(port) {
      var _ref;
      _this.connRefused = false;
      if ((_ref = _this.db) != null) {
        _ref.quit();
      }
      _this.db = redis.createClient(port, 'localhost', {
        connect_timeout: 2000
      });
      _this.db.on('error', function(err) {
        if (err.message.indexOf('ECONNREFUSED') > -1) {
          _this.connRefused = true;
          return _this.log.error(err, 'DB | Wrong port?');
        }
      });
      exports.eventPollers.setDB(_this.db);
      return exports.actionInvokers.setDB(_this.db);
    };
  })(this);


  /*
  Checks whether the db is connected and passes either an error on failure after
  ten attempts within five seconds, or nothing on success to the callback(err).
  
  @public isConnected( *cb* )
  @param {function} cb
   */

  exports.isConnected = (function(_this) {
    return function(cb) {
      var fCheckConnection, numAttempts;
      if (!_this.db) {
        return cb(new Error('DB | DB initialization did not occur or failed miserably!'));
      } else {
        if (_this.db.connected) {
          return cb();
        } else {
          numAttempts = 0;
          fCheckConnection = function() {
            if (_this.connRefused) {
              return cb(new Error('DB | Connection refused! Wrong port?'));
            } else {
              if (_this.db.connected) {
                _this.log.info('DB | Successfully connected to DB!');
                return cb();
              } else if (numAttempts++ < 10) {
                return setTimeout(fCheckConnection, 100);
              } else {
                return cb(new Error('DB | Connection to DB failed!'));
              }
            }
          };
          return setTimeout(fCheckConnection, 100);
        }
      }
    };
  })(this);


  /*
  Abstracts logging for simple action replies from the DB.
  
  @private replyHandler( *action* )
  @param {String} action
   */

  replyHandler = (function(_this) {
    return function(action) {
      return function(err, reply) {
        if (err) {
          return _this.log.warn(err, "during '" + action + "'");
        } else {
          return _this.log.info("DB | " + action + ": " + reply);
        }
      };
    };
  })(this);


  /*
  Push an event into the event queue.
  
  @public pushEvent( *oEvent* )
  @param {Object} oEvent
   */

  exports.pushEvent = (function(_this) {
    return function(oEvent) {
      if (oEvent) {
        _this.log.info("DB | Event pushed into the queue: '" + oEvent.eventid + "'");
        return _this.db.rpush('event_queue', JSON.stringify(oEvent));
      } else {
        return _this.log.warn('DB | Why would you give me an empty event...');
      }
    };
  })(this);


  /*
  Pop an event from the event queue and pass it to cb(err, obj).
  
  @public popEvent( *cb* )
  @param {function} cb
   */

  exports.popEvent = (function(_this) {
    return function(cb) {
      var makeObj;
      makeObj = function(pcb) {
        return function(err, obj) {
          return pcb(err, JSON.parse(obj));
        };
      };
      return _this.db.lpop('event_queue', makeObj(cb));
    };
  })(this);


  /*
  Purge the event queue.
  
  @public purgeEventQueue()
   */

  exports.purgeEventQueue = (function(_this) {
    return function() {
      return _this.db.del('event_queue', replyHandler('purging event queue'));
    };
  })(this);


  /*
  Hashes a string based on SHA-3-512.
  
  @private hash( *plainText* )
  @param {String} plainText
   */

  hash = (function(_this) {
    return function(plainText) {
      var err;
      if (plainText == null) {
        return null;
      }
      try {
        return (crypto.SHA3(plainText, {
          outputLength: 512
        })).toString();
      } catch (_error) {
        err = _error;
        _this.log.warn(err, 'DB | during hashing');
        return null;
      }
    };
  })(this);


  /*
  Encrypts a string using the crypto key from the config file, based on aes-256-cbc.
  
  @private encrypt( *plainText* )
  @param {String} plainText
   */

  encrypt = (function(_this) {
    return function(plainText) {
      var err;
      if (plainText == null) {
        return null;
      }
      try {
        return crypto.AES.encrypt(plainText, crypto_key);
      } catch (_error) {
        err = _error;
        _this.log.warn(err, 'DB | during encryption');
        return null;
      }
    };
  })(this);


  /*
  Decrypts an encrypted string and hands it back on success or null.
  
  @private decrypt( *crypticText* )
  @param {String} crypticText
   */

  decrypt = (function(_this) {
    return function(crypticText) {
      var dec, err;
      if (crypticText == null) {
        return null;
      }
      try {
        dec = crypto.AES.decrypt(crypticText, crypto_key);
        return dec.toString(crypto.enc.Utf8);
      } catch (_error) {
        err = _error;
        _this.log.warn(err, 'DB | during decryption');
        return null;
      }
    };
  })(this);


  /*
  Fetches all linked data set keys from a linking set, fetches the single
  data objects via the provided function and returns the results to cb(err, obj).
  
  @private getSetRecords( *set, fSingle, cb* )
  @param {String} set the set name how it is stored in the DB
  @param {function} fSingle a function to retrieve a single data element
        per set entry
  @param {function} cb the callback(err, obj) function that receives all
        the retrieved data or an error
   */

  getSetRecords = (function(_this) {
    return function(set, fSingle, cb) {
      _this.log.info("DB | Fetching set records: '" + set + "'");
      return _this.db.smembers(set, function(err, arrReply) {
        var fCallback, objReplies, reply, semaphore, _i, _len, _results;
        if (err) {
          _this.log.warn(err, "DB | fetching '" + set + "'");
          return cb(err);
        } else if (arrReply.length === 0) {
          return cb();
        } else {
          semaphore = arrReply.length;
          objReplies = {};
          setTimeout(function() {
            if (semaphore > 0) {
              return cb(new Error("Timeout fetching '" + set + "'"));
            }
          }, 2000);
          fCallback = function(prop) {
            return function(err, data) {
              --semaphore;
              if (err) {
                _this.log.warn(err, "DB | fetching single element: '" + prop + "'");
              } else if (!data) {
                _this.log.warn(new Error("Empty key in DB: '" + prop + "'"));
              } else {
                objReplies[prop] = data;
              }
              if (semaphore === 0) {
                return cb(null, objReplies);
              }
            };
          };
          _results = [];
          for (_i = 0, _len = arrReply.length; _i < _len; _i++) {
            reply = arrReply[_i];
            _results.push(fSingle(reply, fCallback(reply)));
          }
          return _results;
        }
      });
    };
  })(this);

  IndexedModules = (function() {
    function IndexedModules(setname, log) {
      this.setname = setname;
      this.log = log;
      this.deleteUserParams = __bind(this.deleteUserParams, this);
      this.getUserParamsIds = __bind(this.getUserParamsIds, this);
      this.getUserParams = __bind(this.getUserParams, this);
      this.storeUserParams = __bind(this.storeUserParams, this);
      this.deleteModule = __bind(this.deleteModule, this);
      this.getModules = __bind(this.getModules, this);
      this.getModuleIds = __bind(this.getModuleIds, this);
      this.getAvailableModuleIds = __bind(this.getAvailableModuleIds, this);
      this.getModuleParams = __bind(this.getModuleParams, this);
      this.getModule = __bind(this.getModule, this);
      this.unpublish = __bind(this.unpublish, this);
      this.publish = __bind(this.publish, this);
      this.unlinkModule = __bind(this.unlinkModule, this);
      this.linkModule = __bind(this.linkModule, this);
      this.storeModule = __bind(this.storeModule, this);
      this.log.info("DB | (IdxedMods) Instantiated indexed modules for '" + this.setname + "'");
    }

    IndexedModules.prototype.setDB = function(db) {
      this.db = db;
      return this.log.info("DB | (IdxedMods) Registered new DB connection for '" + this.setname + "'");
    };

    IndexedModules.prototype.storeModule = function(mId, userId, data) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".storeModule( " + mId + ", " + userId + ", data )");
      this.db.sadd("" + this.setname + "s", mId, replyHandler("sadd '" + mId + "' to '" + this.setname + "'"));
      this.db.hmset("" + this.setname + ":" + mId, 'code', data['code'], replyHandler("hmset 'code' in hash '" + this.setname + ":" + mId + "'"));
      this.db.hmset("" + this.setname + ":" + mId, 'reqparams', data['reqparams'], replyHandler("hmset 'reqparams' in hash '" + this.setname + ":" + mId + "'"));
      return this.linkModule(mId, userId);
    };

    IndexedModules.prototype.linkModule = function(mId, userId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".linkModule( " + mId + ", " + userId + " )");
      this.db.sadd("" + this.setname + ":" + mId + ":users", userId, replyHandler("sadd " + userId + " to '" + this.setname + ":" + mId + ":users'"));
      return this.db.sadd("user:" + userId + ":" + this.setname + "s", mId, replyHandler("sadd " + mId + " to 'user:" + userId + ":" + this.setname + "s'"));
    };

    IndexedModules.prototype.unlinkModule = function(mId, userId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".unlinkModule( " + mId + ", " + userId + " )");
      this.db.srem("" + this.setname + ":" + mId + ":users", userId, replyHandler("srem " + userId + " from '" + this.setname + ":" + mId + ":users'"));
      return this.db.srem("user:" + userId + ":" + this.setname + "s", mId, replyHandler("srem " + mId + " from 'user:" + userId + ":" + this.setname + "s'"));
    };

    IndexedModules.prototype.publish = function(mId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".publish( " + mId + " )");
      return this.db.sadd("public-" + this.setname + "s", mId, replyHandler("sadd '" + mId + "' to 'public-" + this.setname + "s'"));
    };

    IndexedModules.prototype.unpublish = function(mId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".unpublish( " + mId + " )");
      return this.db.srem("public-" + this.setname + "s", mId, replyHandler("srem '" + mId + "' from 'public-" + this.setname + "s'"));
    };

    IndexedModules.prototype.getModule = function(mId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getModule( " + mId + " )");
      return this.db.hgetall("" + this.setname + ":" + mId, cb);
    };

    IndexedModules.prototype.getModuleParams = function(mId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getModule( " + mId + " )");
      return this.db.hget("" + this.setname + ":" + mId, "params", cb);
    };

    IndexedModules.prototype.getAvailableModuleIds = function(userId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getPublicModuleIds( " + this.suserId + " )");
      return this.db.sunion("public-" + this.setname + "s", "user:" + userId + ":" + this.setname + "s", cb);
    };

    IndexedModules.prototype.getModuleIds = function(cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getModuleIds()");
      return this.db.smembers("" + this.setname + "s", cb);
    };

    IndexedModules.prototype.getModules = function(cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getModules()");
      return getSetRecords("" + this.setname + "s", this.getModule, cb);
    };

    IndexedModules.prototype.deleteModule = function(mId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".deleteModule( " + mId + " )");
      this.db.srem("" + this.setname + "s", mId, replyHandler("srem '" + mId + "' from " + this.setname + "s"));
      this.db.del("" + this.setname + ":" + mId, replyHandler("del of '" + this.setname + ":" + mId + "'"));
      return this.db.smembers("" + this.setname + ":" + mId + ":users", (function(_this) {
        return function(err, obj) {
          var userId, _i, _len, _results;
          _results = [];
          for (_i = 0, _len = obj.length; _i < _len; _i++) {
            userId = obj[_i];
            _results.push(_this.unlinkModule(mId, userId));
          }
          return _results;
        };
      })(this));
    };

    IndexedModules.prototype.storeUserParams = function(mId, userId, data) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".storeUserParams( " + mId + ", " + userId + ", data )");
      this.db.sadd("" + this.setname + "-params", "" + mId + ":" + userId, replyHandler("sadd '" + mId + ":" + userId + "' to '" + this.setname + "-params'"));
      return this.db.set("" + this.setname + "-params:" + mId + ":" + userId, encrypt(data), replyHandler("set user params in '" + this.setname + "-params:" + mId + ":" + userId + "'"));
    };

    IndexedModules.prototype.getUserParams = function(mId, userId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getUserParams( " + mId + ", " + userId + " )");
      return this.db.get("" + this.setname + "-params:" + mId + ":" + userId, function(err, data) {
        return cb(err, decrypt(data));
      });
    };

    IndexedModules.prototype.getUserParamsIds = function(cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getUserParamsIds()");
      return this.db.smembers("" + this.setname + "-params", cb);
    };

    IndexedModules.prototype.deleteUserParams = function(mId, userId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".deleteUserParams(" + mId + ", " + userId + " )");
      this.db.srem("" + this.setname + "-params", "" + mId + ":" + userId, replyHandler("srem '" + mId + ":" + userId + "' from '" + this.setname + "-params'"));
      return this.db.del("" + this.setname + "-params:" + mId + ":" + userId, replyHandler("del '" + this.setname + "-params:" + mId + ":" + userId + "'"));
    };

    return IndexedModules;

  })();


  /*
   *# Rules
   */


  /*
  Query the DB for a rule and pass it to cb(err, obj).
  
  @public getRule( *ruleId, cb* )
  @param {String} ruleId
  @param {function} cb
   */

  exports.getRule = (function(_this) {
    return function(ruleId, cb) {
      _this.log.info("DB | getRule: '" + ruleId + "'");
      return _this.db.get("rule:" + ruleId, cb);
    };
  })(this);


  /*
  Fetch all rules and pass them to cb(err, obj).  
  
  @public getRules( *cb* )
  @param {function} cb
   */

  exports.getRules = (function(_this) {
    return function(cb) {
      _this.log.info('DB | Fetching all Rules');
      return getSetRecords('rules', exports.getRule, cb);
    };
  })(this);


  /*
  Fetch all rule IDs and hand it to cb(err, obj).
  
  @public getRuleIds( *cb* )
  @param {function} cb
   */

  exports.getRuleIds = (function(_this) {
    return function(cb) {
      _this.log.info('DB | Fetching all Rule IDs');
      return _this.db.smembers('rules', cb);
    };
  })(this);


  /*
  Store a string representation of a rule in the DB.
  
  @public storeRule( *ruleId, data* )
  @param {String} ruleId
  @param {String} data
   */

  exports.storeRule = (function(_this) {
    return function(ruleId, data) {
      _this.log.info("DB | storeRule: '" + ruleId + "'");
      _this.db.sadd('rules', "" + ruleId, replyHandler("storing rule key '" + ruleId + "'"));
      return _this.db.set("rule:" + ruleId, data, replyHandler("storing rule '" + ruleId + "'"));
    };
  })(this);


  /*
  Delete a string representation of a rule.
  
  @public deleteRule( *ruleId, userId* )
  @param {String} ruleId
  @param {String} userId
   */

  exports.deleteRule = (function(_this) {
    return function(ruleId) {
      _this.log.info("DB | deleteRule: '" + ruleId + "'");
      _this.db.srem("rules", ruleId, replyHandler("Deleting rule key '" + ruleId + "'"));
      _this.db.del("rule:" + ruleId, replyHandler("Deleting rule '" + ruleId + "'"));
      _this.db.smembers("rule:" + ruleId + ":users", function(err, obj) {
        var delLinkedUserRule, id, _i, _len, _results;
        delLinkedUserRule = function(userId) {
          return _this.db.srem("user:" + userId + ":rules", ruleId, replyHandler("Deleting rule key '" + ruleId + "' in linked user '" + userId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delLinkedUserRule(id));
        }
        return _results;
      });
      _this.db.del("rule:" + ruleId + ":users", replyHandler("Deleting rule '" + ruleId + "' users"));
      _this.db.smembers("rule:" + ruleId + ":active-users", function(err, obj) {
        var delActiveUserRule, id, _i, _len, _results;
        delActiveUserRule = function(userId) {
          return _this.db.srem("user:" + userId + ":active-rules", ruleId, replyHandler("Deleting rule key '" + ruleId + "' in active user '" + userId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delActiveUserRule(id));
        }
        return _results;
      });
      return _this.db.del("rule:" + ruleId + ":active-users", replyHandler("Deleting rule '" + ruleId + "' active users"));
    };
  })(this);


  /*
  Associate a rule to a user.
  
  @public linkRule( *ruleId, userId* )
  @param {String} ruleId
  @param {String} userId
   */

  exports.linkRule = (function(_this) {
    return function(ruleId, userId) {
      _this.log.info("DB | linkRule: '" + ruleId + "' for user '" + userId + "'");
      _this.db.sadd("rule:" + ruleId + ":users", userId, replyHandler("storing user '" + userId + "' for rule key '" + ruleId + "'"));
      return _this.db.sadd("user:" + userId + ":rules", ruleId, replyHandler("storing rule key '" + ruleId + "' for user '" + userId + "'"));
    };
  })(this);


  /*
  Get rules linked to a user and hand it to cb(err, obj).
  
  @public getUserLinkRule( *userId, cb* )
  @param {String} userId
  @param {function} cb
   */

  exports.getUserLinkedRules = (function(_this) {
    return function(userId, cb) {
      _this.log.info("DB | getUserLinkedRules: for user '" + userId + "'");
      return _this.db.smembers("user:" + userId + ":rules", cb);
    };
  })(this);


  /*
  Get users linked to a rule and hand it to cb(err, obj).
  
  @public getRuleLinkedUsers( *ruleId, cb* )
  @param {String} ruleId
  @param {function} cb
   */

  exports.getRuleLinkedUsers = (function(_this) {
    return function(ruleId, cb) {
      _this.log.info("DB | getRuleLinkedUsers: for rule '" + ruleId + "'");
      return _this.db.smembers("rule:" + ruleId + ":users", cb);
    };
  })(this);


  /*
  Delete an association of a rule to a user.
  
  @public unlinkRule( *ruleId, userId* )
  @param {String} ruleId
  @param {String} userId
   */

  exports.unlinkRule = (function(_this) {
    return function(ruleId, userId) {
      _this.log.info("DB | unlinkRule: '" + ruleId + ":" + userId + "'");
      _this.db.srem("rule:" + ruleId + ":users", userId, replyHandler("removing user '" + userId + "' for rule key '" + ruleId + "'"));
      return _this.db.srem("user:" + userId + ":rules", ruleId, replyHandler("removing rule key '" + ruleId + "' for user '" + userId + "'"));
    };
  })(this);


  /*
  Activate a rule.
  
  @public activateRule( *ruleId, userId* )
  @param {String} ruleId
  @param {String} userId
   */

  exports.activateRule = (function(_this) {
    return function(ruleId, userId) {
      _this.log.info("DB | activateRule: '" + ruleId + "' for '" + userId + "'");
      _this.db.sadd("rule:" + ruleId + ":active-users", userId, replyHandler("storing activated user '" + userId + "' in rule '" + ruleId + "'"));
      return _this.db.sadd("user:" + userId + ":active-rules", ruleId, replyHandler("storing activated rule '" + ruleId + "' in user '" + userId + "'"));
    };
  })(this);


  /*
  Get rules activated for a user and hand it to cb(err, obj).
  
  @public getUserLinkRule( *userId, cb* )
  @param {String} userId
  @param {function} cb
   */

  exports.getUserActivatedRules = (function(_this) {
    return function(userId, cb) {
      _this.log.info("DB | getUserActivatedRules: for user '" + userId + "'");
      return _this.db.smembers("user:" + userId + ":active-rules", cb);
    };
  })(this);


  /*
  Get users activated for a rule and hand it to cb(err, obj).
  
  @public getRuleActivatedUsers ( *ruleId, cb* )
  @param {String} ruleId
  @param {function} cb
   */

  exports.getRuleActivatedUsers = (function(_this) {
    return function(ruleId, cb) {
      _this.log.info("DB | getRuleActivatedUsers: for rule '" + ruleId + "'");
      return _this.db.smembers("rule:" + ruleId + ":active-users", cb);
    };
  })(this);


  /*
  Deactivate a rule.
  
  @public deactivateRule( *ruleId, userId* )
  @param {String} ruleId
  @param {String} userId
   */

  exports.deactivateRule = (function(_this) {
    return function(ruleId, userId) {
      _this.log.info("DB | deactivateRule: '" + ruleId + "' for '" + userId + "'");
      _this.db.srem("rule:" + ruleId + ":active-users", userId, replyHandler("removing activated user '" + userId + "' in rule '" + ruleId + "'"));
      return _this.db.srem("user:" + userId + ":active-rules", ruleId, replyHandler("removing activated rule '" + ruleId + "' in user '" + userId + "'"));
    };
  })(this);


  /*
  Fetch all active ruleIds and pass them to cb(err, obj).
  
  @public getAllActivatedRuleIds( *cb* )
  @param {function} cb
   */

  exports.getAllActivatedRuleIdsPerUser = (function(_this) {
    return function(cb) {
      _this.log.info("DB | Fetching all active rules");
      return _this.db.smembers('users', function(err, obj) {
        var fFetchActiveUserRules, result, semaphore, user, _i, _len, _results;
        result = {};
        if (obj.length === 0) {
          return cb(null, result);
        } else {
          semaphore = obj.length;
          fFetchActiveUserRules = function(userId) {
            return _this.db.smembers("user:" + user + ":active-rules", function(err, obj) {
              if (obj.length > 0) {
                result[userId] = obj;
              }
              if (--semaphore === 0) {
                return cb(null, result);
              }
            });
          };
          _results = [];
          for (_i = 0, _len = obj.length; _i < _len; _i++) {
            user = obj[_i];
            _results.push(fFetchActiveUserRules(user));
          }
          return _results;
        }
      });
    };
  })(this);


  /*
   *# Users
   */


  /*
  Store a user object (needs to be a flat structure).
  The password should be hashed before it is passed to this function.
  
  @public storeUser( *objUser* )
  @param {Object} objUser
   */

  exports.storeUser = (function(_this) {
    return function(objUser) {
      _this.log.info("DB | storeUser: '" + objUser.username + "'");
      if (objUser && objUser.username && objUser.password) {
        _this.db.sadd('users', objUser.username, replyHandler("storing user key '" + objUser.username + "'"));
        objUser.password = objUser.password;
        return _this.db.hmset("user:" + objUser.username, objUser, replyHandler("storing user properties '" + objUser.username + "'"));
      } else {
        return _this.log.warn(new Error('DB | username or password was missing'));
      }
    };
  })(this);


  /*
  Fetch all user IDs and pass them to cb(err, obj).
  
  @public getUserIds( *cb* )
  @param {function} cb
   */

  exports.getUserIds = (function(_this) {
    return function(cb) {
      _this.log.info("DB | getUserIds");
      return _this.db.smembers("users", cb);
    };
  })(this);


  /*
  Fetch a user by id and pass it to cb(err, obj).
  
  @public getUser( *userId, cb* )
  @param {String} userId
  @param {function} cb
   */

  exports.getUser = (function(_this) {
    return function(userId, cb) {
      _this.log.info("DB | getUser: '" + userId + "'");
      return _this.db.hgetall("user:" + userId, cb);
    };
  })(this);


  /*
  Deletes a user and all his associated linked and active rules.
  
  @public deleteUser( *userId* )
  @param {String} userId
   */

  exports.deleteUser = (function(_this) {
    return function(userId) {
      _this.log.info("DB | deleteUser: '" + userId + "'");
      _this.db.srem("users", userId, replyHandler("Deleting user key '" + userId + "'"));
      _this.db.del("user:" + userId, replyHandler("Deleting user '" + userId + "'"));
      _this.db.smembers("user:" + userId + ":rules", function(err, obj) {
        var delLinkedRuleUser, id, _i, _len, _results;
        delLinkedRuleUser = function(ruleId) {
          return _this.db.srem("rule:" + ruleId + ":users", userId, replyHandler("Deleting user key '" + userId + "' in linked rule '" + ruleId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delLinkedRuleUser(id));
        }
        return _results;
      });
      _this.db.del("user:" + userId + ":rules", replyHandler("Deleting user '" + userId + "' rules"));
      _this.db.smembers("user:" + userId + ":active-rules", function(err, obj) {
        var delActivatedRuleUser, id, _i, _len, _results;
        delActivatedRuleUser = function(ruleId) {
          return _this.db.srem("rule:" + ruleId + ":active-users", userId, replyHandler("Deleting user key '" + userId + "' in active rule '" + ruleId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delActivatedRuleUser(id));
        }
        return _results;
      });
      _this.db.del("user:" + userId + ":active-rules", replyHandler("Deleting user '" + userId + "' rules"));
      _this.db.smembers("user:" + userId + ":roles", function(err, obj) {
        var delRoleUser, id, _i, _len, _results;
        delRoleUser = function(roleId) {
          return _this.db.srem("role:" + roleId + ":users", userId, replyHandler("Deleting user key '" + userId + "' in role '" + roleId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delRoleUser(id));
        }
        return _results;
      });
      return _this.db.del("user:" + userId + ":roles", replyHandler("Deleting user '" + userId + "' roles"));
    };
  })(this);


  /*
  Checks the credentials and on success returns the user object to the
  callback(err, obj) function. The password has to be hashed (SHA-3-512)
  beforehand by the instance closest to the user that enters the password,
  because we only store hashes of passwords for security6 reasons.
  
  @public loginUser( *userId, password, cb* )
  @param {String} userId
  @param {String} password
  @param {function} cb
   */

  exports.loginUser = (function(_this) {
    return function(userId, password, cb) {
      var fCheck;
      _this.log.info("DB | User '" + userId + "' tries to log in");
      fCheck = function(pw) {
        return function(err, obj) {
          if (err) {
            return cb(err, null);
          } else if (obj && obj.password) {
            if (pw === obj.password) {
              _this.log.info("DB | User '" + obj.username + "' logged in!");
              return cb(null, obj);
            } else {
              return cb(new Error('Wrong credentials!'), null);
            }
          } else {
            return cb(new Error('User not found!'), null);
          }
        };
      };
      return _this.db.hgetall("user:" + userId, fCheck(password));
    };
  })(this);


  /*
   *# User Roles
   */


  /*
  Associate a role with a user.
  
  @public storeUserRole( *userId, role* )
  @param {String} userId
  @param {String} role
   */

  exports.storeUserRole = (function(_this) {
    return function(userId, role) {
      _this.log.info("DB | storeUserRole: '" + userId + ":" + role + "'");
      _this.db.sadd('roles', role, replyHandler("adding role '" + role + "' to role index set"));
      _this.db.sadd("user:" + userId + ":roles", role, replyHandler("adding role '" + role + "' to user '" + userId + "'"));
      return _this.db.sadd("role:" + role + ":users", userId, replyHandler("adding user '" + userId + "' to role '" + role + "'"));
    };
  })(this);


  /*
  Fetch all roles of a user and pass them to cb(err, obj).
  
  @public getUserRoles( *userId* )
  @param {String} userId
  @param {function} cb
   */

  exports.getUserRoles = (function(_this) {
    return function(userId, cb) {
      _this.log.info("DB | getUserRoles: '" + userId + "'");
      return _this.db.smembers("user:" + userId + ":roles", cb);
    };
  })(this);


  /*
  Fetch all users of a role and pass them to cb(err, obj).
  
  @public getUserRoles( *role* )
  @param {String} role
  @param {function} cb
   */

  exports.getRoleUsers = (function(_this) {
    return function(role, cb) {
      _this.log.info("DB | getRoleUsers: '" + role + "'");
      return _this.db.smembers("role:" + role + ":users", cb);
    };
  })(this);


  /*
  Remove a role from a user.
  
  @public removeRoleFromUser( *role, userId* )
  @param {String} role
  @param {String} userId
   */

  exports.removeUserRole = (function(_this) {
    return function(userId, role) {
      _this.log.info("DB | removeRoleFromUser: role '" + role + "', user '" + userId + "'");
      _this.db.srem("user:" + userId + ":roles", role, replyHandler("Removing role '" + role + "' from user '" + userId + "'"));
      return _this.db.srem("role:" + role + ":users", userId, replyHandler("Removing user '" + userId + "' from role '" + role + "'"));
    };
  })(this);


  /*
  Shuts down the db link.
  
  @public shutDown()
   */

  exports.shutDown = (function(_this) {
    return function() {
      var _ref;
      return (_ref = _this.db) != null ? _ref.quit() : void 0;
    };
  })(this);

}).call(this);
