// Generated by CoffeeScript 1.7.1

/*

Dynamic Modules
===============
> Compiles CoffeeScript modules and loads JS modules in a VM, together
> with only a few allowed node.js modules.
 */

(function() {
  var db, dynmod, fLoadModule, isRunning, listUserModules, log, logconf, logger, pollLoop;

  logger = require('./logging');

  db = require('./persistence');

  dynmod = require('./dynamic-modules');

  if (process.argv.length < 8) {
    console.error('Not all arguments have been passed!');
    process.exit();
  }

  logconf = {
    mode: process.argv[2],
    nolog: process.argv[6]
  };

  logconf['io-level'] = process.argv[3];

  logconf['file-level'] = process.argv[4];

  logconf['file-path'] = process.argv[5];

  log = logger.getLogger(logconf);

  log.info('EP | Event Poller starts up');

  db({
    logger: log
  });

  dynmod({
    logger: log,
    keygen: process.argv[7]
  });

  listUserModules = {};

  isRunning = true;

  process.on('disconnect', function() {
    log.info('EP | Shutting down Event Poller');
    isRunning = false;
    return process.exit();
  });

  process.on('message', function(msg) {
    if (msg.event === 'new' || msg.event === 'init') {
      fLoadModule(msg);
    }
    if (msg.event === 'del') {
      delete listUserModules[msg.user][msg.ruleId];
      if (JSON.stringify(listUserModules[msg.user]) === "{}") {
        return delete listUserModules[msg.user];
      }
    }
  });

  fLoadModule = function(msg) {
    var arrName, fAnonymous;
    arrName = msg.rule.event.split(' -> ');
    fAnonymous = function() {
      return db.eventPollers.getModule(arrName[0], function(err, obj) {
        if (!obj) {
          return log.warn("EP | Strange... no module retrieved: " + arrName[0]);
        } else {
          return dynmod.compileString(obj.data, msg.user, msg.rule.id, arrName[0], obj.lang, db.eventPollers, function(result) {
            if (!result.answ === 200) {
              log.error("EP | Compilation of code failed! " + msg.user + ", " + msg.rule.id + ", " + arrName[0]);
            }
            if (!listUserModules[msg.user]) {
              listUserModules[msg.user] = {};
            }
            listUserModules[msg.user][msg.rule.id] = {
              id: msg.rule.event,
              pollfunc: arrName[1],
              module: result.module,
              logger: result.logger
            };
            return log.info("EP | New event module loaded! " + msg.user + ", " + msg.rule.id + ", " + arrName[0]);
          });
        }
      });
    };
    if (msg.event === 'new' || !listUserModules[msg.user] || !listUserModules[msg.user][msg.rule.id]) {
      return fAnonymous();
    }
  };


  /*
  This function will loop infinitely every 10 seconds until isRunning is set to false
  
  @private pollLoop()
   */

  pollLoop = function() {
    var fCallFunction, myRule, oRules, ruleName, userName;
    if (isRunning) {
      for (userName in listUserModules) {
        oRules = listUserModules[userName];
        for (ruleName in oRules) {
          myRule = oRules[ruleName];
          fCallFunction = function(oRule, ruleId, userId) {
            var err;
            try {
              return oRule.module[oRule.pollfunc](function(obj) {
                return db.pushEvent({
                  event: oRule.id,
                  eventid: "polled " + oRule.id + " " + userId + "_" + ((new Date).toISOString()),
                  payload: obj
                });
              });
            } catch (_error) {
              err = _error;
              log.info("EP | ERROR in module when polled: " + oRule.id + " " + userId + ": " + err.message);
              return oRule.logger(err.message);
            }
          };
          fCallFunction(myRule, ruleName, userName);
        }
      }
      return setTimeout(pollLoop, 10000);
    }
  };

  pollLoop();

}).call(this);
