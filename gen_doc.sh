#!/usr/bin/env nodejs
/*
 * # groc Documentation
 * Create the documentation to be displayed through the webserver.
 */
// 
require( 'groc' ).CLI(
  [
    "README.md",
    "LICENSE.md",
    "coffee/*.coffee",
    "examples/*/**",
    "-o./webpages/public/doc"
  ],
  function( err ) {
    if ( err ) console.error( err );
    else console.log( 'Done!' );
  }
);
