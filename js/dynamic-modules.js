// Generated by CoffeeScript 1.7.1

/*

Dynamic Modules
===============
> Compiles CoffeeScript modules and loads JS modules in a VM, together
> with only a few allowed node.js modules.
 */

(function() {
  var cryptico, cs, db, exports, issueApiCall, needle, vm;

  db = require('./persistence');

  vm = require('vm');

  needle = require('needle');

  cs = require('coffee-script');

  cryptico = require('my-cryptico');


  /*
  Module call
  -----------
  Initializes the dynamic module handler.
  
  @param {Object} args
   */

  exports = module.exports = (function(_this) {
    return function(args) {
      var numBits, passPhrase;
      _this.log = args.logger;
      if (!_this.strPublicKey && args['keygen']) {
        db(args);
        passPhrase = args['keygen'];
        numBits = 1024;
        _this.oPrivateRSAkey = cryptico.generateRSAKey(passPhrase, numBits);
        _this.strPublicKey = cryptico.publicKeyString(_this.oPrivateRSAkey);
        _this.log.info("DM | Public Key generated: " + _this.strPublicKey);
      }
      return module.exports;
    };
  })(this);

  exports.getPublicKey = (function(_this) {
    return function() {
      return _this.strPublicKey;
    };
  })(this);

  issueApiCall = (function(_this) {
    return function(method, url, credentials, cb) {
      var err, func;
      try {
        if (method === 'get') {
          func = needle.get;
        } else {
          func = needle.post;
        }
        return func(url, credentials, function(err, resp, body) {
          if (!err) {
            return cb(body);
          } else {
            return cb();
          }
        });
      } catch (_error) {
        err = _error;
        return _this.log.info('DM | Error even before calling!');
      }
    };
  })(this);


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
      var answ, err, fTryToLoad, logFunction;
      answ = {
        code: 200,
        message: 'Successfully compiled'
      };
      if (lang === 'CoffeeScript') {
        try {
          src = cs.compile(src);
        } catch (_error) {
          err = _error;
          answ.code = 400;
          answ.message = 'Compilation of CoffeeScript failed at line ' + err.location.first_line;
        }
      }
      logFunction = function(uId, rId, mId) {
        return function(msg) {
          return db.appendLog(uId, rId, mId, msg);
        };
      };
      db.resetLog(userId, ruleId);
      fTryToLoad = function(params) {
        var oDecrypted, sandbox;
        if (params) {
          try {
            oDecrypted = cryptico.decrypt(params, _this.oPrivateRSAkey);
            params = JSON.parse(oDecrypted.plaintext);
          } catch (_error) {
            err = _error;
            _this.log.warn("DM | Error during parsing of user defined params for " + userId + ", " + ruleId + ", " + modId);
            params = {};
          }
        } else {
          params = {};
        }
        sandbox = {
          id: userId + '.' + modId + '.vm',
          params: params,
          apicall: issueApiCall,
          log: logFunction(userId, ruleId, modId),
          exports: {}
        };
        try {
          vm.runInNewContext(src, sandbox, sandbox.id);
        } catch (_error) {
          err = _error;
          console.log(err);
          answ.code = 400;
          answ.message = 'Loading Module failed: ' + err.message;
        }
        return cb({
          answ: answ,
          module: sandbox.exports
        });
      };
      if (dbMod) {
        return dbMod.getUserParams(modId, userId, function(err, obj) {
          return fTryToLoad(obj);
        });
      } else {
        return fTryToLoad();
      }
    };
  })(this);

}).call(this);
