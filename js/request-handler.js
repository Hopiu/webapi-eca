// Generated by CoffeeScript 1.7.1

/*

Request Handler
============
> The request handler (surprisingly) handles requests made through HTTP to
> the [HTTP Listener](http-listener.html). It will handle user requests for
> pages as well as POST requests such as user login, module storing, event
> invocation and also admin commands.
 */

(function() {
  var crypto, db, dirHandlers, exports, fs, getHandlerPath, getRemoteScripts, getScript, getTemplate, mustache, path, qs, renderPage;

  db = require('./persistence');

  fs = require('fs');

  path = require('path');

  qs = require('querystring');

  mustache = require('mustache');

  crypto = require('crypto-js');

  dirHandlers = path.resolve(__dirname, '..', 'webpages', 'handlers');

  exports = module.exports = (function(_this) {
    return function(args) {
      var fStoreUser, oUser, user, users;
      _this.log = args.logger;
      _this.userRequestHandler = args['request-service'];
      _this.objAdminCmds = {
        shutdown: function(obj, cb) {
          var data;
          data = {
            code: 200,
            message: 'Shutting down... BYE!'
          };
          setTimeout(args['shutdown-function'], 500);
          return cb(null, data);
        }
      };
      db(args);
      users = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config', 'users.json')));
      fStoreUser = function(username, oUser) {
        oUser.username = username;
        return db.storeUser(oUser);
      };
      for (user in users) {
        oUser = users[user];
        fStoreUser(user, oUser);
      }
      return module.exports;
    };
  })(this);


  /*
  Handles possible events that were posted to this server and pushes them into the
  event queue.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleEvent( *req, resp* )
   */

  exports.handleEvent = function(req, resp) {
    var body;
    body = '';
    req.on('data', function(data) {
      return body += data;
    });
    return req.on('end', function() {
      var answ, err, obj, rand, timestamp;
      try {
        obj = JSON.parse(body);
      } catch (_error) {
        err = _error;
        resp.send(400, 'Badly formed event!');
      }
      if (obj && obj.event && !err) {
        timestamp = (new Date()).toISOString();
        rand = (Math.floor(Math.random() * 10e9)).toString(16).toUpperCase();
        obj.eventid = "" + obj.event + "_" + timestamp + "_" + rand;
        answ = {
          code: 200,
          message: "Thank you for the event: " + obj.eventid
        };
        resp.send(answ.code, answ);
        return db.pushEvent(obj);
      } else {
        return resp.send(400, 'Your event was missing important parameters!');
      }
    });
  };


  /*
  Associates the user object with the session if login is successful.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleLogin( *req, resp* )
   */

  exports.handleLogin = (function(_this) {
    return function(req, resp) {
      var body;
      body = '';
      req.on('data', function(data) {
        return body += data;
      });
      return req.on('end', function() {
        var obj;
        obj = JSON.parse(body);
        return db.loginUser(obj.username, obj.password, function(err, usr) {
          if (err) {
            _this.log.warn("RH | AUTH-UH-OH ( " + obj.username + " ): " + err.message);
          } else {
            req.session.user = usr;
          }
          if (req.session.user) {
            return resp.send('OK!');
          } else {
            return resp.send(401, 'NO!');
          }
        });
      });
    };
  })(this);


  /*
  A post request retrieved on this handler causes the user object to be
  purged from the session, thus the user will be logged out.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleLogout( *req, resp* )
   */

  exports.handleLogout = function(req, resp) {
    if (req.session) {
      req.session.user = null;
      return resp.send('Bye!');
    }
  };


  /*
  Resolves the path to a handler webpage.
  
  @private getHandlerPath( *name* )
  @param {String} name
   */

  getHandlerPath = function(name) {
    return path.join(dirHandlers, name + '.html');
  };


  /*
  Fetches a template.
  
  @private getTemplate( *name* )
  @param {String} name
   */

  getTemplate = function(name) {
    var pth;
    pth = path.join(dirHandlers, 'templates', name + '.html');
    return fs.readFileSync(pth, 'utf8');
  };


  /*
  Fetches a script.
  
  @private getScript( *name* )
  @param {String} name
   */

  getScript = function(name) {
    var pth;
    pth = path.join(dirHandlers, 'js', name + '.js');
    return fs.readFileSync(pth, 'utf8');
  };


  /*
  Fetches remote scripts snippets.
  
  @private getRemoteScripts( *name* )
  @param {String} name
   */

  getRemoteScripts = function(name) {
    var pth;
    pth = path.join(dirHandlers, 'remote-scripts', name + '.html');
    return fs.readFileSync(pth, 'utf8');
  };


  /*
  Renders a page, with helps of mustache, depending on the user session and returns it.
  
  @private renderPage( *name, sess, msg* )
  @param {String} name
  @param {Object} sess
  @param {Object} msg
   */

  renderPage = function(name, req, resp, msg) {
    var code, content, data, err, menubar, page, pageElements, pathSkel, remote_scripts, script, skeleton;
    pathSkel = path.join(dirHandlers, 'skeleton.html');
    skeleton = fs.readFileSync(pathSkel, 'utf8');
    code = 200;
    data = {
      message: msg,
      user: req.session.user
    };
    try {
      script = getScript(name);
    } catch (_error) {}
    try {
      remote_scripts = getRemoteScripts(name);
    } catch (_error) {}
    try {
      content = getTemplate(name);
    } catch (_error) {
      err = _error;
      content = getTemplate('error');
      script = getScript('error');
      code = 404;
      data.message = 'Invalid Page!';
    }
    if (req.session.user) {
      menubar = getTemplate('menubar');
    }
    pageElements = {
      content: content,
      script: script,
      remote_scripts: remote_scripts,
      menubar: menubar
    };
    page = mustache.render(skeleton, pageElements);
    return resp.send(code, mustache.render(page, data));
  };


  /*
  Present the desired forge page to the user.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleForge( *req, resp* )
   */

  exports.handleForge = function(req, resp) {
    var page;
    page = req.query.page;
    if (!req.session.user) {
      page = 'login';
    }
    return renderPage(page, req, resp);
  };


  /*
  Handles the user command requests.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleUser( *req, resp* )
   */

  exports.handleUserCommand = (function(_this) {
    return function(req, resp) {
      var body;
      if (req.session && req.session.user) {
        body = '';
        req.on('data', function(data) {
          return body += data;
        });
        return req.on('end', function() {
          var obj;
          obj = qs.parse(body);
          return _this.userRequestHandler(req.session.user, obj, function(obj) {
            return resp.send(obj.code, obj);
          });
        });
      } else {
        return resp.send(401, 'Login first!');
      }
    };
  })(this);


  /*
  Present the admin console to the user if he's allowed to see it.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleForge( *req, resp* )
   */

  exports.handleAdmin = function(req, resp) {
    var msg, page;
    if (!req.session.user) {
      page = 'login';
    } else if (req.session.user.isAdmin !== "true") {
      page = 'login';
      msg = 'You need to be admin!';
    } else {
      page = 'admin';
    }
    return renderPage(page, req, resp, msg);
  };


  /*
  Handles the admin command requests.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleAdminCommand( *req, resp* )
   */

  exports.handleAdminCommand = (function(_this) {
    return function(req, resp) {
      var body;
      if (req.session && req.session.user && req.session.user.isAdmin === "true") {
        body = '';
        req.on('data', function(data) {
          return body += data;
        });
        return req.on('end', function() {
          var obj;
          obj = qs.parse(body);
          _this.log.info('RH | Received admin request: ' + obj.command);
          if (obj.command && _this.objAdminCmds[obj.command]) {
            return _this.objAdminCmds[obj.command](obj, function(err, obj) {
              return resp.send(obj.code, obj);
            });
          } else {
            return resp.send(404, 'Command unknown!');
          }
        });
      } else {
        return resp.send(401, 'You need to be logged in as admin!');
      }
    };
  })(this);

}).call(this);
