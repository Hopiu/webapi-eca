// Generated by CoffeeScript 1.7.1

/*

Engine
==================
> The heart of the WebAPI ECA System. The engine loads action invoker modules
> corresponding to active rules actions and invokes them if an appropriate event
> is retrieved.
 */

(function() {
  var db, dynmod, exports, isRunning, jsonQuery, listUserRules, numExecutingFunctions, oOperators, pollQueue, processEvent, updateActionModules, validConditions;

  db = require('./persistence');

  dynmod = require('./dynamic-modules');

  jsonQuery = require('js-select');


  /*
  This is ging to have a structure like:
  An object of users with their active rules and the required action modules
  
  		"user-1":
  			"rule-1":
  				"rule": oRule-1
  				"actions":
  					"action-1": oAction-1
  					"action-2": oAction-2
  			"rule-2":
  				"rule": oRule-2
  				"actions":
  					"action-1": oAction-1
  		"user-2":
  			"rule-3":
  				"rule": oRule-3
  				"actions":
  					"action-3": oAction-3
   */

  listUserRules = {};

  isRunning = false;


  /*
  Module call
  -----------
  Initializes the Engine and starts polling the event queue for new events.
  
  @param {Object} args
   */

  exports = module.exports = (function(_this) {
    return function(args) {
      if (!isRunning) {
        _this.log = args.logger;
        dynmod(args);
        setTimeout(exports.startEngine, 10);
        return module.exports;
      }
    };
  })(this);


  /*
  This is a helper function for the unit tests so we can verify that action
  modules are loaded correctly
  
  @public getListUserRules ()
   */

  exports.getListUserRules = function() {
    return listUserRules;
  };

  exports.startEngine = function() {
    if (!isRunning) {
      isRunning = true;
      return pollQueue();
    }
  };


  /*
  An event associated to rules happened and is captured here. Such events 
  are basically CRUD on rules.
  
  @public internalEvent ( *evt* )
  @param {Object} evt
   */

  exports.internalEvent = (function(_this) {
    return function(evt) {
      var oRule, oUser;
      if (!listUserRules[evt.user] && evt.intevent !== 'del') {
        listUserRules[evt.user] = {};
      }
      oUser = listUserRules[evt.user];
      oRule = evt.rule;
      if (evt.intevent === 'new' || (evt.intevent === 'init' && !oUser[oRule.id])) {
        oUser[oRule.id] = {
          rule: oRule,
          actions: {}
        };
        updateActionModules(oRule.id);
      }
      if (evt.intevent === 'del' && oUser) {
        delete oUser[evt.ruleId];
      }
      if (JSON.stringify(oUser) === "{}") {
        return delete listUserRules[evt.user];
      }
    };
  })(this);


  /*
  As soon as changes were made to the rule set we need to ensure that the aprropriate action
  invoker modules are loaded, updated or deleted.
  
  @private updateActionModules ( *updatedRuleId* )
  @param {Object} updatedRuleId
   */

  updateActionModules = (function(_this) {
    return function(updatedRuleId) {
      var fAddRequired, fRemoveNotRequired, name, oUser, userName, _results;
      fRemoveNotRequired = function(oUser) {
        var action, fRequired, _results;
        fRequired = function(actionName) {
          var action, _i, _len, _ref;
          _ref = oUser[updatedRuleId].rule.actions;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            action = _ref[_i];
            if ((action.split(' -> '))[0] === actionName) {
              return true;
            }
          }
          return false;
        };
        if (oUser[updatedRuleId]) {
          _results = [];
          for (action in oUser[updatedRuleId].rule.actions) {
            if (!fRequired(action)) {
              _results.push(delete oUser[updatedRuleId].actions[action]);
            } else {
              _results.push(void 0);
            }
          }
          return _results;
        }
      };
      for (name in listUserRules) {
        oUser = listUserRules[name];
        fRemoveNotRequired(oUser);
      }
      fAddRequired = function(userName, oUser) {
        var fCheckRules, nmRl, oRl, _results;
        fCheckRules = function(oMyRule) {
          var action, fAddIfNewOrNotExisting, _i, _len, _ref, _results;
          fAddIfNewOrNotExisting = function(actionName) {
            var moduleName;
            moduleName = (actionName.split(' -> '))[0];
            if (!oMyRule.actions[moduleName] || oMyRule.rule.id === updatedRuleId) {
              return db.actionInvokers.getModule(userName, moduleName, function(err, obj) {
                if (obj) {
                  return dynmod.compileString(obj.data, userName, oMyRule.rule, moduleName, obj.lang, "actioninvoker", db.actionInvokers, function(result) {
                    if (result.answ.code === 200) {
                      _this.log.info("EN | Module '" + moduleName + "' successfully loaded for userName '" + userName + "' in rule '" + oMyRule.rule.id + "'");
                    } else {
                      _this.log.error("EN | Compilation of code failed! " + userName + ", " + oMyRule.rule.id + ", " + moduleName + ": " + result.answ.message);
                    }
                    return oMyRule.actions[moduleName] = result;
                  });
                } else {
                  return _this.log.warn("EN | " + moduleName + " not found for " + oMyRule.rule.id + "!");
                }
              });
            }
          };
          _ref = oMyRule.rule.actions;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            action = _ref[_i];
            _results.push(fAddIfNewOrNotExisting(action));
          }
          return _results;
        };
        _results = [];
        for (nmRl in oUser) {
          oRl = oUser[nmRl];
          _results.push(fCheckRules(oRl));
        }
        return _results;
      };
      _results = [];
      for (userName in listUserRules) {
        oUser = listUserRules[userName];
        _results.push(fAddRequired(userName, oUser));
      }
      return _results;
    };
  })(this);

  numExecutingFunctions = 1;

  pollQueue = function() {
    if (isRunning) {
      db.popEvent(function(err, obj) {
        if (!err && obj) {
          return processEvent(obj);
        }
      });
      return setTimeout(pollQueue, 20 * numExecutingFunctions);
    }
  };

  oOperators = {
    '<': function(x, y) {
      return x < y;
    },
    '<=': function(x, y) {
      return x <= y;
    },
    '>': function(x, y) {
      return x > y;
    },
    '>=': function(x, y) {
      return x >= y;
    },
    '==': function(x, y) {
      return x === y;
    },
    '!=': function(x, y) {
      return x !== y;
    },
    'instr': function(x, y) {
      return x.indexOf(y) > -1;
    }
  };


  /*
  Checks whether all conditions of the rule are met by the event.
  
  @private validConditions ( *evt, rule* )
  @param {Object} evt
  @param {Object} rule
   */

  validConditions = function(evt, rule, userId, ruleId) {
    var cond, err, op, selectedProperty, val, _i, _len, _ref;
    if (rule.conditions.length === 0) {
      return true;
    }
    _ref = rule.conditions;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      cond = _ref[_i];
      selectedProperty = jsonQuery(evt, cond.selector).nodes();
      if (selectedProperty.length === 0) {
        db.appendLog(userId, ruleId, 'Condition', "Node not found in event: " + cond.selector);
        return false;
      }
      op = oOperators[cond.operator];
      if (!op) {
        db.appendLog(userId, ruleId, 'Condition', "Unknown operator: " + cond.operator + ". Use one of " + (Object.keys(oOperators).join(', ')));
        return false;
      }
      try {
        if (cond.type === 'string') {
          val = selectedProperty[0];
        } else if (cond.type === 'bool') {
          val = selectedProperty[0];
        } else if (cond.type === 'value') {
          val = parseFloat(selectedProperty[0]) || 0;
        }
        if (!op(val, cond.compare)) {
          return false;
        }
      } catch (_error) {
        err = _error;
        db.appendLog(userId, ruleId, 'Condition', "Error: Selector '" + cond.selector + "', Operator " + cond.operator + ", Compare: " + cond.compare);
      }
    }
    return true;
  };


  /*
  Handles retrieved events.
  
  @private processEvent ( *evt* )
  @param {Object} evt
   */

  processEvent = (function(_this) {
    return function(evt) {
      var fCheckEventForUser, fSearchAndInvokeAction, oUser, userName, _results;
      fSearchAndInvokeAction = function(node, arrPath, funcName, evt, depth) {
        var argument, arrArgs, arrSelectors, data, err, oArg, sel, selector, _i, _j, _len, _len1, _ref;
        if (!node) {
          _this.log.error("EN | Didn't find property in user rule list: " + arrPath.join(', ') + " at depth " + depth);
          return;
        }
        if (depth === arrPath.length) {
          try {
            numExecutingFunctions++;
            _this.log.info("EN | " + funcName + " executes...");
            arrArgs = [];
            if (node.funcArgs[funcName]) {
              _ref = node.funcArgs[funcName];
              for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                oArg = _ref[_i];
                arrSelectors = oArg.value.match(/#\{(.*?)\}/g);
                argument = oArg.value;
                if (arrSelectors) {
                  for (_j = 0, _len1 = arrSelectors.length; _j < _len1; _j++) {
                    sel = arrSelectors[_j];
                    selector = sel.substring(2, sel.length - 1);
                    data = jsonQuery(evt.body, selector).nodes()[0];
                    argument = argument.replace(sel, data);
                    if (oArg.value === sel) {
                      argument = data;
                    }
                  }
                }
                arrArgs.push(argument);
              }
            } else {
              _this.log.warn("EN | Weird! arguments not loaded for function '" + funcName + "'!");
            }
            node.module[funcName].apply(null, arrArgs);
            _this.log.info("EN | " + funcName + " finished execution");
          } catch (_error) {
            err = _error;
            _this.log.info("EN | ERROR IN ACTION INVOKER: " + err.message);
            node.logger(err.message);
          }
          if (numExecutingFunctions-- % 100 === 0) {
            return _this.log.warn("EN | The system is producing too many tokens! Currently: " + numExecutingFunctions);
          }
        } else {
          return fSearchAndInvokeAction(node[arrPath[depth]], arrPath, funcName, evt, depth + 1);
        }
      };
      _this.log.info('EN | Processing event: ' + evt.eventname);
      fCheckEventForUser = function(userName, oUser) {
        var action, arr, oMyRule, ruleEvent, ruleName, _results;
        _results = [];
        for (ruleName in oUser) {
          oMyRule = oUser[ruleName];
          ruleEvent = oMyRule.rule.eventname;
          if (oMyRule.rule.timestamp) {
            ruleEvent += '_created:' + oMyRule.rule.timestamp;
          }
          if (evt.eventname === ruleEvent && validConditions(evt, oMyRule.rule, userName, ruleName)) {
            this.log.info('EN | EVENT FIRED: ' + evt.eventname + ' for rule ' + ruleName);
            _results.push((function() {
              var _i, _len, _ref, _results1;
              _ref = oMyRule.rule.actions;
              _results1 = [];
              for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                action = _ref[_i];
                arr = action.split(' -> ');
                _results1.push(fSearchAndInvokeAction(listUserRules, [userName, ruleName, 'actions', arr[0]], arr[1], evt, 0));
              }
              return _results1;
            })());
          } else {
            _results.push(void 0);
          }
        }
        return _results;
      };
      if (evt.username) {
        return fCheckEventForUser(evt.username, listUserRules[evt.username]);
      } else {
        _results = [];
        for (userName in listUserRules) {
          oUser = listUserRules[userName];
          _results.push(fCheckEventForUser(userName, oUser));
        }
        return _results;
      }
    };
  })(this);

  exports.shutDown = function() {
    isRunning = false;
    return listUserRules = {};
  };

}).call(this);
