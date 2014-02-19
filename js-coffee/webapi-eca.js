// Generated by CoffeeScript 1.6.3
/*

WebAPI-ECA Engine
=================

>This is the main module that is used to run the whole application:
>
>     node webapi-eca [opt]
>
> See below in the optimist CLI preparation for allowed optional parameters `[opt]`.
*/


(function() {
  var argv, conf, cp, db, engine, fs, http, init, logger, opt, optimist, path, procCmds, shutDown, usage,
    _this = this;

  logger = require('./logging');

  conf = require('./config');

  db = require('./persistence');

  engine = require('./engine');

  http = require('./http-listener');

  fs = require('fs');

  path = require('path');

  cp = require('child_process');

  optimist = require('optimist');

  procCmds = {};

  /*
  Let's prepare the optimist CLI optional arguments `[opt]`:
  */


  usage = 'This runs your webapi-based ECA engine';

  opt = {
    'h': {
      alias: 'help',
      describe: 'Display this'
    },
    'c': {
      alias: 'config-path',
      describe: 'Specify a path to a custom configuration file, other than "config/config.json"'
    },
    'w': {
      alias: 'http-port',
      describe: 'Specify a HTTP port for the web server'
    },
    'd': {
      alias: 'db-port',
      describe: 'Specify a port for the redis DB'
    },
    'm': {
      alias: 'log-mode',
      describe: 'Specify a log mode: [development|productive]'
    },
    'i': {
      alias: 'log-io-level',
      describe: 'Specify the log level for the I/O'
    },
    'f': {
      alias: 'log-file-level',
      describe: 'Specify the log level for the log file'
    },
    'p': {
      alias: 'log-file-path',
      describe: 'Specify the path to the log file within the "logs" folder'
    },
    'n': {
      alias: 'nolog',
      describe: 'Set this if no output shall be generated'
    }
  };

  argv = optimist.usage(usage).options(opt).argv;

  if (argv.help) {
    console.log(optimist.help());
    process.exit();
  }

  /*
  This function is invoked right after the module is loaded and starts the server.
  
  @private init()
  */


  init = function() {
    var args, logconf;
    conf(argv.c);
    if (!conf.isReady()) {
      console.error('FAIL: Config file not ready! Shutting down...');
      process.exit();
    }
    logconf = conf.getLogConf();
    if (argv.m) {
      logconf['mode'] = argv.m;
    }
    if (argv.i) {
      logconf['io-level'] = argv.i;
    }
    if (argv.f) {
      logconf['file-level'] = argv.f;
    }
    if (argv.p) {
      logconf['file-path'] = argv.p;
    }
    if (argv.n) {
      logconf['nolog'] = argv.n;
    }
    try {
      fs.unlinkSync(path.resolve(__dirname, '..', 'logs', logconf['file-path']));
    } catch (_error) {}
    _this.log = logger.getLogger(logconf);
    _this.log.info('RS | STARTING SERVER');
    args = {
      logger: _this.log,
      logconf: logconf
    };
    args['http-port'] = parseInt(argv.w || conf.getHttpPort());
    args['db-port'] = parseInt(argv.w || conf.getDbPort());
    _this.log.info('RS | Initialzing DB');
    db(args);
    return db.isConnected(function(err, result) {
      var cliArgs, poller;
      if (err) {
        return shutDown();
      } else {
        _this.log.info('RS | Initialzing engine');
        engine(args);
        _this.log.info('RS | Initialzing http listener');
        http.addShutdownHandler(shutDown);
        http(args);
        _this.log.info('RS | Passing handlers to engine');
        engine.addPersistence(db);
        _this.log.info('RS | Passing handlers to http listener');
        _this.log.info('RS | Forking child process for the event poller');
        cliArgs = [args.logconf['mode'], args.logconf['io-level'], args.logconf['file-level'], args.logconf['file-path'], args.logconf['nolog']];
        return poller = cp.fork(path.resolve(__dirname, 'event-poller'), cliArgs);
      }
    });
  };

  /*
  Shuts down the server.
  
  @private shutDown()
  */


  shutDown = function() {
    _this.log.warn('RS | Received shut down command!');
    if (engine != null) {
      engine.shutDown();
    }
    if (http != null) {
      http.shutDown();
    }
    return process.exit();
  };

  /*
  ## Process Commands
  
  When the server is run as a child process, this function handles messages
  from the parent process (e.g. the testing suite)
  */


  process.on('message', function(cmd) {
    return typeof procCmds[cmd] === "function" ? procCmds[cmd]() : void 0;
  });

  process.on('SIGINT', shutDown);

  process.on('SIGTERM', shutDown);

  procCmds.die = shutDown;

  init();

}).call(this);
