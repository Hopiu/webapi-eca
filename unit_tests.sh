#!/usr/bin/env nodejs
process.chdir( __dirname );
var fs = require( 'fs' ),
  path = require( 'path' ),
  nodeunit = require( 'nodeunit' ),
  db = require( './js/persistence' ),
  cs = require('coffee-script'),
  args = process.argv.slice( 2 ),
  fEnd = function() {
    console.log( 'Shutting down DB from unit_test.sh script. '
      +'This might take as long as the event poller loop delay is...' );
    db.shutDown();
  };
   
if (cs.register) {
  cs.register();
}
if( args[ 0 ] !== undefined ) {
  var fl = path.resolve( args[ 0 ] );
  if ( fs.existsSync( fl ) ) {
    nodeunit.reporters.default.run( [ fl ], null, fEnd );
  } else {
    console.error( 'File not found!!' );
  }
} else {
  nodeunit.reporters.default.run( [ 'testing' ], null, fEnd );
}
