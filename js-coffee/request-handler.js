// Generated by CoffeeScript 1.6.3
/*

Request Handler
============
> The request handler (surprisingly) handles requests made through HTTP to
> the [HTTP Listener](http-listener.html). It will handle user requests for
> pages as well as POST requests such as user login, module storing, event
> invocation and also admin commands.
*/


(function() {
  var answerHandler, crypto, db, exports, fs, getHandlerFileAsString, getHandlerPath, getIncludeFileAsString, mustache, path, qs, renderPage, sendLoginOrPage,
    _this = this;

  db = require('./persistence');

  fs = require('fs');

  path = require('path');

  qs = require('querystring');

  mustache = require('mustache');

  crypto = require('crypto-js');

  exports = module.exports = function(args) {
    var log, user, users, _i, _len;
    log = args.logger;
    _this.userRequestHandler = args['request-service'];
    _this.objAdminCmds = {
      shutdown: function(args, answerHandler) {
        answerHandler.answerSuccess('Shutting down... BYE!');
        return setTimeout(args['shutdown-function'], 500);
      }
    };
    db(args);
    users = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config', 'users.json')));
    for (_i = 0, _len = users.length; _i < _len; _i++) {
      user = users[_i];
      db.storeUser(user);
    }
    return module.exports;
  };

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
      var obj;
      obj = qs.parse(body);
      if (obj && obj.event && obj.eventid) {
        resp.send('Thank you for the event: ' + obj.event + ' (' + obj.eventid + ')!');
        return db.pushEvent(obj);
      } else {
        return resp.send(400, 'Your event was missing important parameters!');
      }
    });
  };

  /*
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleLogin( *req, resp* )
  */


  exports.handleLogin = function(req, resp) {
    var body;
    body = '';
    req.on('data', function(data) {
      return body += data;
    });
    return req.on('end', function() {
      var obj;
      if (!req.session || !req.session.user) {
        obj = qs.parse(body);
        return db.loginUser(obj.username, obj.password, function(err, usr) {
          if (err) {
            log.warn(err, "RH | AUTH-UH-OH (" + obj.username + ")");
          } else {
            req.session.user = usr;
          }
          if (req.session.user) {
            return resp.send('OK!');
          } else {
            return resp.send(401, 'NO!');
          }
        });
      } else {
        return resp.send('Welcome ' + req.session.user.name + '!');
      }
    });
  };

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
    return path.resolve(__dirname, '..', 'webpages', 'handlers', name + '.html');
  };

  /*
  Resolves the path to a handler webpage and returns it as a string.
  
  @private getHandlerFileAsString( *name* )
  @param {String} name
  */


  getHandlerFileAsString = function(name) {
    return fs.readFileSync(getHandlerPath(name), 'utf8');
  };

  /*
  Fetches an include file.
  
  @private getIncludeFileAsString( *name* )
  @param {String} name
  */


  getIncludeFileAsString = function(name) {
    var pth;
    pth = path.resolve(__dirname, '..', 'webpages', 'handlers', 'includes', name + '.html');
    return fs.readFileSync(pth, 'utf8');
  };

  /*
  Renders a page depending on the user session and returns it.
  
  @private renderPage( *name, sess* )
  @param {String} name
  @param {Object} sess
  */


  renderPage = function(name, sess, msg) {
    var menubar, requires, template, view;
    template = getHandlerFileAsString(name);
    menubar = getIncludeFileAsString('menubar');
    requires = getIncludeFileAsString('requires');
    view = {
      user: sess.user,
      head_requires: requires,
      div_menubar: menubar,
      message: msg
    };
    return mustache.render(template, view);
  };

  /*
  Sends the desired page or the login to the user.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public renderPageOrLogin( *req, resp, pagename* )
  @param {String} pagename
  */


  sendLoginOrPage = function(pagename, req, resp) {
    if (!req.session) {
      req.session = {};
    }
    if (!req.session.user) {
      pagename = 'login';
    }
    return resp.send(renderPage(pagename, req.session));
  };

  /*
  Present the module forge to the user.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleForgeModules( *req, resp* )
  */


  exports.handleForgeModules = function(req, resp) {
    return sendLoginOrPage('forge_modules', req, resp);
  };

  /*
  Present the rules forge to the user.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleForgeRules( *req, resp* )
  */


  exports.handleForgeRules = function(req, resp) {
    return sendLoginOrPage('forge_rules', req, resp);
  };

  /*
  Present the event invoke page to the user.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleInvokeEvent( *req, resp* )
  */


  exports.handleInvokeEvent = function(req, resp) {
    return sendLoginOrPage('push_event', req, resp);
  };

  /*
  Handles the user command requests.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleUser( *req, resp* )
  */


  exports.handleUserCommand = function(req, resp) {
    var body;
    if (!req.session || !req.session.user) {
      return resp.send(401, 'Login first!');
    } else {
      body = '';
      req.on('data', function(data) {
        return body += data;
      });
      return req.on('end', function() {
        var obj;
        obj = qs.parse(body);
        console.log(obj);
        return this.userRequestHandler(req.session.user, obj, function(err, obj) {
          console.log('user request handler sent answer!');
          console.log(obj);
          if (!err) {
            return resp.send('yay!');
          } else {
            return resp.send(404, 'Command unknown!');
          }
        });
      });
    }
  };

  /*
  Handles the admin command requests.
  
  *Requires
  the [request](http://nodejs.org/api/http.html#http_class_http_clientrequest)
  and [response](http://nodejs.org/api/http.html#http_class_http_serverresponse)
  objects.*
  
  @public handleAdmin( *req, resp* )
  */


  exports.handleAdmin = function(req, resp) {
    var q, _base, _name;
    if (req.session && req.session.user) {
      if (req.session.user.isAdmin === "true") {
        q = req.query;
        log.info('RH | Received admin request: ' + req.originalUrl);
        if (q.cmd) {
          return typeof (_base = _this.objAdminCmds)[_name = q.cmd] === "function" ? _base[_name](q, answerHandler(req, resp, true)) : void 0;
        } else {
          return resp.send(404, 'Command unknown!');
        }
      } else {
        return resp.send(renderPage('unauthorized', req.session));
      }
    } else {
      return resp.sendfile(getHandlerPath('login'));
    }
  };

  answerHandler = function(req, resp, ntbr) {
    var hasBeenAnswered, needsToBeRendered, request, response, ret;
    request = req;
    response = resp;
    needsToBeRendered = ntbr;
    hasBeenAnswered = false;
    ret = {
      answerSuccess: function(msg) {
        if (!hasBeenAnswered) {
          if (needsToBeRendered) {
            response.send(renderPage('command_answer', request.session, msg));
          } else {
            response.send(msg);
          }
        }
        return hasBeenAnswered = true;
      },
      answerError: function(msg) {
        if (!hasBeenAnswered) {
          if (needsToBeRendered) {
            response.send(400, renderPage('error', request.session, msg));
          } else {
            response.send(400, msg);
          }
        }
        return hasBeenAnswered = true;
      },
      isAnswered: function() {
        return hasBeenAnswered;
      }
    };
    setTimeout(function() {
      return ret.answerError('Strange... maybe try again?');
    }, 5000);
    return ret;
  };

}).call(this);
