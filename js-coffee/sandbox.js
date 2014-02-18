// Generated by CoffeeScript 1.6.3
(function() {
  var bunyan, logger, opt;

  bunyan = require('bunyan');

  opt = {
    name: "webapi-eca"
  };

  opt.streams = [
    {
      level: 'info',
      stream: process.stdout
    }, {
      level: 'info',
      path: 'logs/server.log'
    }
  ];

  logger = bunyan.createLogger(opt);

  logger.info('weeee');

}).call(this);
