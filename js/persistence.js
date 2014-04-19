// Generated by CoffeeScript 1.7.1

/*

Persistence
============
> Handles the connection to the database and provides functionalities for event pollers,
> action invokers, rules and the (hopefully encrypted) storing of user-specific parameters
> per module.
> General functionality as a wrapper for the module holds initialization,
> the retrieval of modules and shut down.
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
  var IndexedModules, exports, getSetRecords, redis, replyHandler,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  redis = require('redis');


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

  exports.getLogger = (function(_this) {
    return function() {
      return _this.log;
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
          return _this.log.warn('DB | Wrong port?');
        } else {
          return _this.log.error(err);
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
            var _ref;
            if (_this.connRefused) {
              if ((_ref = _this.db) != null) {
                _ref.quit();
              }
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
      this.deleteUserArguments = __bind(this.deleteUserArguments, this);
      this.getUserArguments = __bind(this.getUserArguments, this);
      this.getAllModuleUserArguments = __bind(this.getAllModuleUserArguments, this);
      this.getUserArgumentsFunctions = __bind(this.getUserArgumentsFunctions, this);
      this.storeUserArguments = __bind(this.storeUserArguments, this);
      this.deleteUserParams = __bind(this.deleteUserParams, this);
      this.getUserParamsIds = __bind(this.getUserParamsIds, this);
      this.getUserParams = __bind(this.getUserParams, this);
      this.storeUserParams = __bind(this.storeUserParams, this);
      this.deleteModule = __bind(this.deleteModule, this);
      this.getModules = __bind(this.getModules, this);
      this.getModuleIds = __bind(this.getModuleIds, this);
      this.getAvailableModuleIds = __bind(this.getAvailableModuleIds, this);
      this.getModuleParams = __bind(this.getModuleParams, this);
      this.getModuleField = __bind(this.getModuleField, this);
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


    /*
    	Stores a module and links it to the user.
    	
    	@private storeModule( *userId, oModule* )
    	@param {String} userId
    	@param {object} oModule
     */

    IndexedModules.prototype.storeModule = function(userId, oModule) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".storeModule( " + userId + ", oModule )");
      this.db.sadd("" + this.setname + "s", oModule.id, replyHandler("sadd '" + this.setname + "s' -> '" + oModule.id + "'"));
      this.db.hmset("" + this.setname + ":" + oModule.id, oModule, replyHandler("hmset '" + this.setname + ":" + oModule.id + "' -> [oModule]"));
      return this.linkModule(oModule.id, userId);
    };

    IndexedModules.prototype.linkModule = function(mId, userId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".linkModule( " + mId + ", " + userId + " )");
      this.db.sadd("" + this.setname + ":" + mId + ":users", userId, replyHandler("sadd '" + this.setname + ":" + mId + ":users' -> '" + userId + "'"));
      return this.db.sadd("user:" + userId + ":" + this.setname + "s", mId, replyHandler("sadd 'user:" + userId + ":" + this.setname + "s' -> " + mId));
    };

    IndexedModules.prototype.unlinkModule = function(mId, userId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".unlinkModule( " + mId + ", " + userId + " )");
      this.db.srem("" + this.setname + ":" + mId + ":users", userId, replyHandler("srem '" + this.setname + ":" + mId + ":users' -> " + userId));
      return this.db.srem("user:" + userId + ":" + this.setname + "s", mId, replyHandler("srem 'user:" + userId + ":" + this.setname + "s' -> " + mId));
    };

    IndexedModules.prototype.publish = function(mId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".publish( " + mId + " )");
      return this.db.sadd("public-" + this.setname + "s", mId, replyHandler("sadd 'public-" + this.setname + "s' -> '" + mId + "'"));
    };

    IndexedModules.prototype.unpublish = function(mId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".unpublish( " + mId + " )");
      return this.db.srem("public-" + this.setname + "s", mId, replyHandler("srem 'public-" + this.setname + "s' -> '" + mId + "'"));
    };

    IndexedModules.prototype.getModule = function(mId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getModule( " + mId + " )");
      return this.db.hgetall("" + this.setname + ":" + mId, cb);
    };

    IndexedModules.prototype.getModuleField = function(mId, field, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getModuleField( " + mId + ", " + field + " )");
      return this.db.hget("" + this.setname + ":" + mId, field, cb);
    };

    IndexedModules.prototype.getModuleParams = function(mId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getModuleParams( " + mId + " )");
      return this.db.hget("" + this.setname + ":" + mId, "params", cb);
    };

    IndexedModules.prototype.getAvailableModuleIds = function(userId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getAvailableModuleIds( " + userId + " )");
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
      this.db.srem("" + this.setname + "s", mId, replyHandler("srem '" + this.setname + "s' -> '" + mId + "'"));
      this.db.del("" + this.setname + ":" + mId, replyHandler("del '" + this.setname + ":" + mId + "'"));
      this.unpublish(mId);
      return this.db.smembers("" + this.setname + ":" + mId + ":users", (function(_this) {
        return function(err, obj) {
          var userId, _i, _len, _results;
          _results = [];
          for (_i = 0, _len = obj.length; _i < _len; _i++) {
            userId = obj[_i];
            _this.unlinkModule(mId, userId);
            _this.deleteUserParams(mId, userId);
            _results.push(exports.getUserLinkedRules(userId, function(err, obj) {
              var rule, _j, _len1, _results1;
              _results1 = [];
              for (_j = 0, _len1 = obj.length; _j < _len1; _j++) {
                rule = obj[_j];
                _results1.push(_this.getUserArgumentsFunctions(userId, rule, mId, function(err, obj) {
                  return _this.deleteUserArguments(userId, rule, mId);
                }));
              }
              return _results1;
            }));
          }
          return _results;
        };
      })(this));
    };


    /*
    	Stores user params for a module. They are expected to be RSA encrypted with helps of
    	the provided cryptico JS library and will only be decrypted right before the module is loaded!
    	
    	@private storeUserParams( *mId, userId, encData* )
    	@param {String} mId
    	@param {String} userId
    	@param {object} encData
     */

    IndexedModules.prototype.storeUserParams = function(mId, userId, encData) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".storeUserParams( " + mId + ", " + userId + ", encData )");
      this.db.sadd("" + this.setname + "-params", "" + mId + ":" + userId, replyHandler("sadd '" + this.setname + "-params' -> '" + mId + ":" + userId + "'"));
      return this.db.set("" + this.setname + "-params:" + mId + ":" + userId, encData, replyHandler("set '" + this.setname + "-params:" + mId + ":" + userId + "' -> [encData]"));
    };

    IndexedModules.prototype.getUserParams = function(mId, userId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getUserParams( " + mId + ", " + userId + " )");
      return this.db.get("" + this.setname + "-params:" + mId + ":" + userId, cb);
    };

    IndexedModules.prototype.getUserParamsIds = function(cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getUserParamsIds()");
      return this.db.smembers("" + this.setname + "-params", cb);
    };

    IndexedModules.prototype.deleteUserParams = function(mId, userId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".deleteUserParams( " + mId + ", " + userId + " )");
      this.db.srem("" + this.setname + "-params", "" + mId + ":" + userId, replyHandler("srem '" + this.setname + "-params' -> '" + mId + ":" + userId + "'"));
      return this.db.del("" + this.setname + "-params:" + mId + ":" + userId, replyHandler("del '" + this.setname + "-params:" + mId + ":" + userId + "'"));
    };


    /*
    	Stores user arguments for a function within a module. They are expected to be RSA encrypted with helps of
    	the provided cryptico JS library and will only be decrypted right before the module is loaded!
    	
    	@private storeUserArguments( *userId, ruleId, mId, funcId, encData* )
    	@param {String} userId
    	@param {String} ruleId
    	@param {String} mId
    	@param {String} funcId
    	@param {object} encData
     */

    IndexedModules.prototype.storeUserArguments = function(userId, ruleId, mId, funcId, encData) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".storeUserArguments( " + userId + ", " + ruleId + ", " + mId + ", " + funcId + ", encData )");
      this.db.sadd("" + this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":functions", funcId, replyHandler("sadd '" + this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":functions' -> '" + funcId + "'"));
      return this.db.set("" + this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":function:" + funcId, encData, replyHandler("set '" + this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":function:" + funcId + "' -> [encData]"));
    };

    IndexedModules.prototype.getUserArgumentsFunctions = function(userId, ruleId, mId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getUserArgumentsFunctions( " + userId + ", " + ruleId + ", " + mId + " )");
      return this.db.get("" + this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":functions", cb);
    };

    IndexedModules.prototype.getAllModuleUserArguments = function(userId, ruleId, mId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getAllModuleUserArguments( " + userId + ", " + ruleId + ", " + mId + " )");
      return this.db.smembers("" + this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":functions", (function(_this) {
        return function(err, obj) {
          var fRegisterFunction, func, oAnswer, sem, _i, _len, _results;
          sem = obj.length;
          oAnswer = {};
          _results = [];
          for (_i = 0, _len = obj.length; _i < _len; _i++) {
            func = obj[_i];
            fRegisterFunction = function(func) {
              return function(err, obj) {
                if (obj) {
                  oAnswer[func] = obj;
                }
                if (--sem === 0) {
                  return cb(null, oAnswer);
                }
              };
            };
            _results.push(_this.db.get("" + _this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":function:" + func, fRegisterFunction(func)));
          }
          return _results;
        };
      })(this));
    };

    IndexedModules.prototype.getUserArguments = function(userId, ruleId, mId, funcId, cb) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".getUserArguments( " + userId + ", " + ruleId + ", " + mId + ", " + funcId + " )");
      return this.db.get("" + this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":function:" + funcId, cb);
    };

    IndexedModules.prototype.deleteUserArguments = function(userId, ruleId, mId) {
      this.log.info("DB | (IdxedMods) " + this.setname + ".deleteUserArguments( " + userId + ", " + ruleId + ", " + mId + " )");
      return this.db.smembers("" + this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":functions", (function(_this) {
        return function(err, obj) {
          var func, _i, _len, _results;
          _results = [];
          for (_i = 0, _len = obj.length; _i < _len; _i++) {
            func = obj[_i];
            _results.push(_this.db.del("" + _this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":function:" + func, replyHandler("del '" + _this.setname + ":" + userId + ":" + ruleId + ":" + mId + ":function:" + func + "'")));
          }
          return _results;
        };
      })(this));
    };

    return IndexedModules;

  })();


  /*
   *# Rules
   */


  /*
  Appends a log entry.
  
  @public log( *userId, ruleId, message* )
  @param {String} userId
  @param {String} ruleId
  @param {String} message
   */

  exports.appendLog = (function(_this) {
    return function(userId, ruleId, moduleId, message) {
      return _this.db.append("" + userId + ":" + ruleId + ":log", "[" + ((new Date()).toISOString()) + "] {" + moduleId + "} " + message + "\n");
    };
  })(this);


  /*
  Retrieves a log entry.
  
  @public getLog( *userId, ruleId* )
  @param {String} userId
  @param {String} ruleId
  @param {function} cb
   */

  exports.getLog = (function(_this) {
    return function(userId, ruleId, cb) {
      return _this.db.get("" + userId + ":" + ruleId + ":log", cb);
    };
  })(this);


  /*
  Resets a log entry.
  
  @public resetLog( *userId, ruleId* )
  @param {String} userId
  @param {String} ruleId
   */

  exports.resetLog = (function(_this) {
    return function(userId, ruleId) {
      return _this.db.del("" + userId + ":" + ruleId + ":log", replyHandler("del '" + userId + ":" + ruleId + ":log'"));
    };
  })(this);


  /*
  Query the DB for a rule and pass it to cb(err, obj).
  
  @public getRule( *ruleId, cb* )
  @param {String} ruleId
  @param {function} cb
   */

  exports.getRule = (function(_this) {
    return function(ruleId, cb) {
      _this.log.info("DB | getRule( '" + ruleId + "' )");
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
      _this.log.info("DB | Fetching all Rules: getSetRecords 'rules'");
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
      _this.log.info("DB | Fetching all Rule IDs: 'rules'");
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
      _this.log.info("DB | storeRule( '" + ruleId + "' )");
      _this.db.sadd('rules', "" + ruleId, replyHandler("sadd 'rules' -> '" + ruleId + "'"));
      return _this.db.set("rule:" + ruleId, data, replyHandler("set 'rule:" + ruleId + "' -> [data]"));
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
      _this.log.info("DB | deleteRule( '" + ruleId + "' )");
      _this.db.srem("rules", ruleId, replyHandler("srem 'rules' -> '" + ruleId + "'"));
      _this.db.del("rule:" + ruleId, replyHandler("del 'rule:" + ruleId + "'"));
      _this.db.smembers("rule:" + ruleId + ":users", function(err, obj) {
        var delLinkedUserRule, id, _i, _len, _results;
        delLinkedUserRule = function(userId) {
          exports.resetLog(userId, ruleId);
          return _this.db.srem("user:" + userId + ":rules", ruleId, replyHandler("srem 'user:" + userId + ":rules' -> '" + ruleId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delLinkedUserRule(id));
        }
        return _results;
      });
      _this.db.del("rule:" + ruleId + ":users", replyHandler("del 'rule:" + ruleId + ":users'"));
      _this.db.smembers("rule:" + ruleId + ":active-users", function(err, obj) {
        var delActiveUserRule, id, _i, _len, _results;
        delActiveUserRule = function(userId) {
          return _this.db.srem("user:" + userId + ":active-rules", ruleId, replyHandler("srem 'user:" + userId + ":active-rules' -> '" + ruleId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delActiveUserRule(id));
        }
        return _results;
      });
      return _this.db.del("rule:" + ruleId + ":active-users", replyHandler("del 'rule:" + ruleId + ":active-users'"));
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
      _this.log.info("DB | linkRule: '" + ruleId + "' to user '" + userId + "'");
      _this.db.sadd("rule:" + ruleId + ":users", userId, replyHandler("sadd 'rule:" + ruleId + ":users' -> '" + userId + "'"));
      return _this.db.sadd("user:" + userId + ":rules", ruleId, replyHandler("sadd 'user:" + userId + ":rules' -> '" + ruleId + "'"));
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
      _this.log.info("DB | getUserLinkedRules: smembers 'user:" + userId + ":rules'");
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
      _this.log.info("DB | getRuleLinkedUsers: smembers 'rule:" + ruleId + ":users'");
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
      _this.db.srem("rule:" + ruleId + ":users", userId, replyHandler("srem 'rule:" + ruleId + ":users' -> '" + userId + "'"));
      return _this.db.srem("user:" + userId + ":rules", ruleId, replyHandler("srem 'user:" + userId + ":rules' -> '" + ruleId + "'"));
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
      _this.db.sadd("rule:" + ruleId + ":active-users", userId, replyHandler("sadd 'rule:" + ruleId + ":active-users' -> '" + userId + "'"));
      return _this.db.sadd("user:" + userId + ":active-rules", ruleId, replyHandler("sadd 'user:" + userId + ":active-rules' -> '" + ruleId + "'"));
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
      _this.log.info("DB | getUserActivatedRules: smembers 'user:" + userId + ":active-rules'");
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
      _this.log.info("DB | getRuleActivatedUsers: smembers 'rule:" + ruleId + ":active-users'");
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
      _this.db.srem("rule:" + ruleId + ":active-users", userId, replyHandler("srem 'rule:" + ruleId + ":active-users' -> '" + userId + "'"));
      return _this.db.srem("user:" + userId + ":active-rules", ruleId, replyHandler("srem 'user:" + userId + ":active-rules' '" + ruleId + "'"));
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
        _this.db.sadd('users', objUser.username, replyHandler("sadd 'users' -> '" + objUser.username + "'"));
        objUser.password = objUser.password;
        return _this.db.hmset("user:" + objUser.username, objUser, replyHandler("hmset 'user:" + objUser.username + "' -> [objUser]"));
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
      _this.db.srem("users", userId, replyHandler("srem 'users' -> '" + userId + "'"));
      _this.db.del("user:" + userId, replyHandler("del 'user:" + userId + "'"));
      _this.db.smembers("user:" + userId + ":rules", function(err, obj) {
        var delLinkedRuleUser, id, _i, _len, _results;
        delLinkedRuleUser = function(ruleId) {
          return _this.db.srem("rule:" + ruleId + ":users", userId, replyHandler("srem 'rule:" + ruleId + ":users' -> '" + userId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delLinkedRuleUser(id));
        }
        return _results;
      });
      _this.db.del("user:" + userId + ":rules", replyHandler("del 'user:" + userId + ":rules'"));
      _this.db.smembers("user:" + userId + ":active-rules", function(err, obj) {
        var delActivatedRuleUser, id, _i, _len, _results;
        delActivatedRuleUser = function(ruleId) {
          return _this.db.srem("rule:" + ruleId + ":active-users", userId, replyHandler("srem 'rule:" + ruleId + ":active-users' -> '" + userId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delActivatedRuleUser(id));
        }
        return _results;
      });
      _this.db.del("user:" + userId + ":active-rules", replyHandler("del user:" + userId + ":active-rules"));
      _this.db.smembers("user:" + userId + ":roles", function(err, obj) {
        var delRoleUser, id, _i, _len, _results;
        delRoleUser = function(roleId) {
          return _this.db.srem("role:" + roleId + ":users", userId, replyHandler("srem 'role:" + roleId + ":users' -> '" + userId + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delRoleUser(id));
        }
        return _results;
      });
      return _this.db.del("user:" + userId + ":roles", replyHandler("del 'user:" + userId + ":roles'"));
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
      _this.db.sadd('roles', role, replyHandler("sadd '" + role + "' to 'roles'"));
      _this.db.sadd("user:" + userId + ":roles", role, replyHandler("sadd 'user:" + userId + ":roles' -> '" + role + "'"));
      return _this.db.sadd("role:" + role + ":users", userId, replyHandler("sadd 'role:" + role + ":users' -> '" + userId + "'"));
    };
  })(this);


  /*
  Associate a role with a user.
  
  @public storeUserRole( *userId, role* )
  @param {String} userId
  @param {String} role
   */

  exports.deleteRole = (function(_this) {
    return function(role) {
      _this.log.info("DB | deleteRole: '" + role + "'");
      _this.db.smembers("role:" + role + ":users", function(err, obj) {
        var delUserRole, id, _i, _len, _results;
        delUserRole = function(userId) {
          return _this.db.srem("user:" + userId + ":roles", role, replyHandler("srem 'user:" + userId + ":roles' -> '" + role + "'"));
        };
        _results = [];
        for (_i = 0, _len = obj.length; _i < _len; _i++) {
          id = obj[_i];
          _results.push(delUserRole(id));
        }
        return _results;
      });
      return _this.db.srem("roles", role, replyHandler("srem 'roles' -> '" + role + "'"));
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
      _this.db.srem("user:" + userId + ":roles", role, replyHandler("srem 'user:" + userId + ":roles' -> '" + role + "'"));
      return _this.db.srem("role:" + role + ":users", userId, replyHandler("srem 'role:" + role + ":users' -> '" + userId + "'"));
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
