// Generated by CoffeeScript 1.7.1

/*

Dynamic Modules
===============
> Compiles CoffeeScript modules and loads JS modules in a VM, together
> with only a few allowed node.js modules.
 */

(function() {
  var cryptoJS, cs, db, encryption, exports, fTryToLoadModule, getFunctionParamNames, importio, logFunction, needle, regexpComments, request, vm;

  db = require('./persistence');

  encryption = require('./encryption');

  vm = require('vm');

  needle = require('needle');

  request = require('request');

  cs = require('coffee-script');

  cryptoJS = require('crypto-js');

  importio = require('import-io').client;


  /*
  Module call
  -----------
  Initializes the dynamic module handler.
  
  @param {Object} args
   */

  exports = module.exports = (function(_this) {
    return function(args) {
      _this.log = args.logger;
      db(args);
      return module.exports;
    };
  })(this);

  logFunction = function(uId, rId, mId) {
    return function(msg) {
      return db.appendLog(uId, rId, mId, msg);
    };
  };

  regexpComments = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

  getFunctionParamNames = function(fName, func, oFuncs) {
    var fnStr, result;
    fnStr = func.toString().replace(regexpComments, '');
    result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(/([^\s,]+)/g);
    if (!result) {
      result = [];
    }
    return oFuncs[fName] = result;
  };


  /*
  Try to run a JS module from a string, together with the
  given parameters. If it is written in CoffeeScript we
  compile it first into JS.
  
  @public compileString ( *src, id, params, lang* )
  @param {String} src
  @param {String} id
  @param {Object} params
  @param {String} lang
   */

  exports.compileString = (function(_this) {
    return function(src, userId, ruleId, modId, lang, dbMod, cb) {
      var err;
      if (lang === 'CoffeeScript') {
        try {
          _this.log.info("DM | Compiling module '" + modId + "' for user '" + userId + "'");
          src = cs.compile(src);
        } catch (_error) {
          err = _error;
          cb({
            answ: {
              code: 400,
              message: 'Compilation of CoffeeScript failed at line ' + err.location.first_line
            }
          });
          return;
        }
      }
      _this.log.info("DM | Trying to fetch user specific module '" + modId + "' paramters for user '" + userId + "'");
      if (dbMod) {
        return dbMod.getUserParams(modId, userId, function(err, obj) {
          var name, oParam, oParams, _ref;
          try {
            oParams = {};
            _ref = JSON.parse(obj);
            for (name in _ref) {
              oParam = _ref[name];
              oParams[name] = encryption.decrypt(oParam.value);
            }
            _this.log.info("DM | Loaded user defined params for " + userId + ", " + ruleId + ", " + modId);
          } catch (_error) {
            err = _error;
            _this.log.warn("DM | Error during parsing of user defined params for " + userId + ", " + ruleId + ", " + modId);
            _this.log.warn(err);
          }
          return fTryToLoadModule(userId, ruleId, modId, src, dbMod, oParams, cb);
        });
      } else {
        return fTryToLoadModule(userId, ruleId, modId, src, dbMod, null, cb);
      }
    };
  })(this);

  fTryToLoadModule = (function(_this) {
    return function(userId, ruleId, modId, src, dbMod, params, cb) {
      var answ, err, fName, fRegisterArguments, func, logFunc, msg, oFuncArgs, oFuncParams, sandbox, _ref;
      if (!params) {
        params = {};
      }
      answ = {
        code: 200,
        message: 'Successfully compiled'
      };
      _this.log.info("DM | Running module '" + modId + "' for user '" + userId + "'");
      logFunc = logFunction(userId, ruleId, modId);
      sandbox = {
        id: "" + userId + "." + ruleId + "." + modId + ".vm",
        params: params,
        needle: needle,
        importio: importio,
        request: request,
        cryptoJS: cryptoJS,
        log: logFunc,
        debug: console.log,
        exports: {}
      };
      try {
        vm.runInNewContext(src, sandbox, sandbox.id);
      } catch (_error) {
        err = _error;
        answ.code = 400;
        msg = err.message;
        if (!msg) {
          msg = 'Try to run the script locally to track the error! Sadly we cannot provide the line number';
        }
        answ.message = 'Loading Module failed: ' + msg;
      }
      _this.log.info("DM | Module '" + modId + "' ran successfully for user '" + userId + "' in rule '" + ruleId + "'");
      oFuncParams = {};
      oFuncArgs = {};
      _ref = sandbox.exports;
      for (fName in _ref) {
        func = _ref[fName];
        getFunctionParamNames(fName, func, oFuncParams);
      }
      if (dbMod) {
        oFuncArgs = {};
        fRegisterArguments = function(fName) {
          return function(err, obj) {
            if (obj) {
              try {
                oFuncArgs[fName] = JSON.parse(obj);
                return _this.log.info("DM | Found and attached user-specific arguments to " + userId + ", " + ruleId + ", " + modId + ": " + obj);
              } catch (_error) {
                err = _error;
                _this.log.warn("DM | Error during parsing of user-specific arguments for " + userId + ", " + ruleId + ", " + modId);
                return _this.log.warn(err);
              }
            }
          };
        };
        for (func in oFuncParams) {
          dbMod.getUserArguments(userId, ruleId, modId, func, fRegisterArguments(func));
        }
      }
      return cb({
        answ: answ,
        module: sandbox.exports,
        funcParams: oFuncParams,
        funcArgs: oFuncArgs,
        logger: sandbox.log
      });
    };
  })(this);

}).call(this);
