// Generated by CoffeeScript 1.6.3
/*

Components Manager
==================
> The components manager takes care of the dynamic JS modules and the rules.
> Event Poller and Action Invoker modules are loaded as strings and stored in the database,
> then compiled into node modules and rules and used in the engine and event poller.
*/


(function() {
  var commandFunctions, db, dynmod, eventEmitter, events, exports, forgeModule, fs, getModuleParams, getModules, hasRequiredParams, path,
    _this = this;

  db = require('./persistence');

  dynmod = require('./dynamic-modules');

  fs = require('fs');

  path = require('path');

  events = require('events');

  eventEmitter = new events.EventEmitter();

  /*
  Module call
  -----------
  Initializes the Components Manager and constructs a new Event Emitter.
  
  @param {Object} args
  */


  exports = module.exports = function(args) {
    _this.log = args.logger;
    db(args);
    dynmod(args);
    return module.exports;
  };

  /*
  Add an event handler (eh) that listens for rules.
  
  @public addRuleListener ( *eh* )
  @param {function} eh
  */


  exports.addRuleListener = function(eh) {
    eventEmitter.addListener('rule', eh);
    return db.getAllActivatedRuleIdsPerUser(function(err, objUsers) {
      var fGoThroughUsers, rules, user, _results;
      fGoThroughUsers = function(user, rules) {
        var fFetchRule, rule, _i, _len, _results;
        fFetchRule = function(rule) {
          var _this = this;
          return db.getRule(rule, function(err, oRule) {
            return eventEmitter.emit('rule', {
              event: 'init',
              user: user,
              rule: JSON.parse(oRule)
            });
          });
        };
        _results = [];
        for (_i = 0, _len = rules.length; _i < _len; _i++) {
          rule = rules[_i];
          _results.push(fFetchRule(rule));
        }
        return _results;
      };
      _results = [];
      for (user in objUsers) {
        rules = objUsers[user];
        _results.push(fGoThroughUsers(user, rules));
      }
      return _results;
    });
  };

  /*
  Processes a user request coming through the request-handler.
  - `user` is the user object as it comes from the DB.
  - `oReq` is the request object that contains:
    - `command` as a string 
    - `payload` an optional stringified JSON object 
  The callback function `callback( obj )` will receive an object
  containing the HTTP response code and a corresponding message.
  
  @public processRequest ( *user, oReq, callback* )
  @param {Object} user
  @param {Object} oReq
  @param {function} callback
  */


  exports.processRequest = function(user, oReq, callback) {
    var dat, err;
    if (!oReq.payload) {
      oReq.payload = '{}';
    }
    try {
      dat = JSON.parse(oReq.payload);
    } catch (_error) {
      err = _error;
      return callback({
        code: 404,
        message: 'You had a strange payload in your request!'
      });
    }
    if (commandFunctions[oReq.command]) {
      return commandFunctions[oReq.command](user, dat, callback);
    } else {
      return callback({
        code: 404,
        message: 'What do you want from me?'
      });
    }
  };

  hasRequiredParams = function(arrParams, oPayload) {
    var answ, param, _i, _len;
    answ = {
      code: 400,
      message: "Your request didn't contain all necessary fields! Requires: " + (arrParams.join())
    };
    for (_i = 0, _len = arrParams.length; _i < _len; _i++) {
      param = arrParams[_i];
      if (!oPayload[param]) {
        return answ;
      }
    }
    answ.code = 200;
    answ.message = 'All required properties found';
    return answ;
  };

  getModules = function(user, oPayload, dbMod, callback) {
    return dbMod.getAvailableModuleIds(user.username, function(err, arrNames) {
      var answReq, fGetFunctions, id, oRes, sem, _i, _len, _results,
        _this = this;
      oRes = {};
      answReq = function() {
        return callback({
          code: 200,
          message: JSON.stringify(oRes)
        });
      };
      sem = arrNames.length;
      if (sem === 0) {
        return answReq();
      } else {
        fGetFunctions = function(id) {
          return dbMod.getModule(id, function(err, oModule) {
            if (oModule) {
              oRes[id] = JSON.parse(oModule.functions);
            }
            if (--sem === 0) {
              return answReq();
            }
          });
        };
        _results = [];
        for (_i = 0, _len = arrNames.length; _i < _len; _i++) {
          id = arrNames[_i];
          _results.push(fGetFunctions(id));
        }
        return _results;
      }
    });
  };

  getModuleParams = function(user, oPayload, dbMod, callback) {
    var answ;
    answ = hasRequiredParams(['id'], oPayload);
    if (answ.code !== 200) {
      return callback(answ);
    } else {
      return dbMod.getModuleParams(oPayload.id, function(err, oPayload) {
        answ.message = oPayload;
        return callback(answ);
      });
    }
  };

  forgeModule = function(user, oPayload, dbMod, callback) {
    var answ;
    answ = hasRequiredParams(['id', 'params', 'lang', 'data'], oPayload);
    if (answ.code !== 200) {
      return callback(answ);
    } else {
      return dbMod.getModule(oPayload.id, function(err, mod) {
        var cm, funcs, id, name, src, _ref;
        if (mod) {
          answ.code = 409;
          answ.message = 'Event Poller module name already existing: ' + oPayload.id;
        } else {
          src = oPayload.data;
          cm = dynmod.compileString(src, user.username, oPayload.id, {}, oPayload.lang);
          answ = cm.answ;
          if (answ.code === 200) {
            funcs = [];
            _ref = cm.module;
            for (name in _ref) {
              id = _ref[name];
              funcs.push(name);
            }
            _this.log.info("CM | Storing new module with functions " + (funcs.join()));
            answ.message = "Event Poller module successfully stored! Found following function(s): " + funcs;
            oPayload.functions = JSON.stringify(funcs);
            dbMod.storeModule(user.username, oPayload);
            if (oPayload["public"] === 'true') {
              dbMod.publish(oPayload.id);
            }
          }
        }
        return callback(answ);
      });
    }
  };

  commandFunctions = {
    get_public_key: function(user, oPayload, callback) {
      return callback({
        code: 200,
        message: dynmod.getPublicKey()
      });
    },
    get_event_pollers: function(user, oPayload, callback) {
      return getModules(user, oPayload, db.eventPollers, callback);
    },
    get_action_invokers: function(user, oPayload, callback) {
      return getModules(user, oPayload, db.actionInvokers, callback);
    },
    get_event_poller_params: function(user, oPayload, callback) {
      return getModuleParams(user, oPayload, db.eventPollers, callback);
    },
    get_action_invoker_params: function(user, oPayload, callback) {
      return getModuleParams(user, oPayload, db.actionInvokers, callback);
    },
    forge_event_poller: function(user, oPayload, callback) {
      return forgeModule(user, oPayload, db.eventPollers, callback);
    },
    forge_action_invoker: function(user, oPayload, callback) {
      return forgeModule(user, oPayload, db.actionInvokers, callback);
    },
    get_rules: function(user, oPayload, callback) {
      return console.log('CM | Implement get_rules');
    },
    forge_rule: function(user, oPayload, callback) {
      var answ;
      answ = hasRequiredParams(['id', 'event', 'conditions', 'actions'], oPayload);
      if (answ.code !== 200) {
        return callback(answ);
      } else {
        return db.getRule(oPayload.id, function(err, oExisting) {
          var arrParams, epModId, id, params, rule, strRule;
          if (oExisting !== null) {
            answ = {
              code: 409,
              message: 'Rule name already existing!'
            };
          } else {
            rule = {
              id: oPayload.id,
              event: oPayload.event,
              conditions: oPayload.conditions,
              actions: oPayload.actions
            };
            strRule = JSON.stringify(rule);
            db.storeRule(rule.id, strRule);
            db.linkRule(rule.id, user.username);
            db.activateRule(rule.id, user.username);
            if (oPayload.event_params) {
              epModId = rule.event.split(' -> ')[0];
              db.eventPollers.storeUserParams(epModId, user.username, oPayload.event_params);
            }
            arrParams = oPayload.action_params;
            for (id in arrParams) {
              params = arrParams[id];
              db.actionInvokers.storeUserParams(id, user.username, JSON.stringify(params));
            }
            eventEmitter.emit('rule', {
              event: 'new',
              user: user.username,
              rule: rule
            });
            answ = {
              code: 200,
              message: 'Rule stored and activated!'
            };
          }
          return callback(answ);
        });
      }
    }
  };

}).call(this);
