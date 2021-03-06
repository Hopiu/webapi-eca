###

Dynamic Modules
===============
> Compiles CoffeeScript modules and loads JS modules in a VM, together
> with only a few allowed node.js modules.
###

# **Loads Modules:**

# - [Persistence](persistence.html)
db = require './persistence'
# - [Encryption](encryption.html)
encryption = require './encryption'

# - Node.js Modules: [vm](http://nodejs.org/api/vm.html) and
#   [events](http://nodejs.org/api/events.html)
vm = require 'vm'
needle = require 'needle'
request = require 'request'

# - External Modules: [coffee-script](http://coffeescript.org/),
#       [crypto-js](https://www.npmjs.org/package/crypto-js) and
#       [import-io](https://www.npmjs.org/package/import-io)
cs = require 'coffee-script'
cryptoJS = require 'crypto-js'
importio = require( 'import-io' ).client


###
Module call
-----------
Initializes the dynamic module handler.

@param {Object} args
###
exports = module.exports = ( args ) =>
	@log = args.logger
	module.exports

logFunction = ( uId, rId, mId ) ->
	( msg ) ->
		db.appendLog uId, rId, mId, msg

regexpComments = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
getFunctionParamNames = ( fName, func, oFuncs ) ->
	fnStr = func.toString().replace regexpComments, ''
	result = fnStr.slice( fnStr.indexOf( '(' ) + 1, fnStr.indexOf( ')' ) ).match /([^\s,]+)/g
	if not result
		result = []
	oFuncs[fName] = result

###
Try to run a JS module from a string, together with the
given parameters. If it is written in CoffeeScript we
compile it first into JS.

@public compileString ( *src, id, params, lang* )
@param {String} src
@param {String} id
@param {Object} params
@param {String} lang
###
exports.compileString = ( src, userId, oRule, modId, lang, modType, dbMod, cb ) =>
	if lang is 'CoffeeScript'
		try
			@log.info "DM | Compiling module '#{ modId }' for user '#{ userId }'"
			src = cs.compile src
		catch err
			cb
				answ:
					code: 400
					message: 'Compilation of CoffeeScript failed at line ' +
						err.location.first_line
			return

	@log.info "DM | Trying to fetch user specific module '#{ modId }' paramters for user '#{ userId }'"
	# dbMod is only attached if the module really gets loaded and needs to fetch user information from the database
	if dbMod
		dbMod.getUserParams modId, userId, ( err, obj ) =>
			try
				oParams = {}
				for name, oParam of JSON.parse obj
					oParams[ name ] = encryption.decrypt oParam.value
				@log.info "DM | Loaded user defined params for #{ userId }, #{ oRule.id }, #{ modId }"
			catch err
				@log.warn "DM | Error during parsing of user defined params for #{ userId }, #{ oRule.id }, #{ modId }"
				@log.warn err
			fTryToLoadModule userId, oRule, modId, src, modType, dbMod, oParams, cb
	else
		fTryToLoadModule userId, oRule, modId, src, modType, dbMod, null, cb


fPushEvent = ( userId, oRule, modType ) ->
	( obj ) ->
		timestamp = ( new Date() ).toISOString()
		if modType is 'eventpoller'
			db.pushEvent
				eventname: oRule.eventname + '_created:' + oRule.timestamp
				body: obj

fSetVar = ( userId, ruleId, modId ) ->
	( field, data ) ->
		db.persistSetVar  userId, ruleId, modId, field, JSON.stringify data
		
fGetVar = ( userId, ruleId, modId ) ->
	( field, cb ) ->
		fObectify = ( cb ) ->
			( err, str ) ->
				if err
					cb err
				else
					try
						cb null, JSON.parse str
					catch
						cb err

		db.persistGetVar  userId, ruleId, modId, field, fObectify cb


fTryToLoadModule = ( userId, oRule, modId, src, modType, dbMod, params, cb ) =>
	if not params
		params = {}

	answ =
		code: 200
		message: 'Successfully compiled'

	@log.info "DM | Running module '#{ modId }' for user '#{ userId }'"
	# The function used to provide logging mechanisms on a per rule basis
	logFunc = logFunction userId, oRule.id, modId
	# The sandbox contains the objects that are accessible to the user. Eventually they need to be required from a vm themselves 
	sandbox = 
		id: "#{ userId }.#{ oRule.id }.#{ modId }.vm"
		params: params
		needle: needle
		importio: importio
		request: request
		cryptoJS: cryptoJS
		log: logFunc
		debug: console.log
		exports: {}
		setTimeout: setTimeout # This one allows probably too much
		pushEvent: fPushEvent userId, oRule, modType
		# TODO garbage collect entries below if rule is deleted...
		setVar: fSetVar userId, oRule.id, modId
		getVar: fGetVar userId, oRule.id, modId


	#TODO child_process to run module!
	#Define max runtime per function call as 10 seconds, after that the child will be killed
	#it can still be active after that if there was a timing function or a callback used...
	#kill the child each time? how to determine whether there's still a token in the module?
	try
		# Finally the module is run in a 
		vm.runInNewContext src, sandbox, sandbox.id
		# TODO We should investigate memory usage and garbage collection (global.gc())?
		# Start Node with the flags —nouse_idle_notification and —expose_gc, and then when you want to run the GC, just call global.gc().
	catch err
		answ.code = 400
		msg = err.message
		if not msg
			msg = 'Try to run the script locally to track the error! Sadly we cannot provide the line number'
		answ.message = 'Loading Module failed: ' + msg

	@log.info "DM | Module '#{ modId }' ran successfully for user '#{ userId }' in rule '#{ oRule.id }'"
	oFuncParams = {}
	oFuncArgs = {}
	for fName, func of sandbox.exports
		getFunctionParamNames fName, func, oFuncParams

	if dbMod
		oFuncArgs = {}

		fRegisterArguments = ( fName ) =>
			( err, obj ) =>
				if obj
					try
						oFuncArgs[ fName ] = JSON.parse obj
						@log.info "DM | Found and attached user-specific arguments to #{ userId }, #{ oRule.id }, #{ modId }: #{ obj }"
					catch err
						@log.warn "DM | Error during parsing of user-specific arguments for #{ userId }, #{ oRule.id }, #{ modId }"
						@log.warn err
		for func of oFuncParams
			dbMod.getUserArguments userId, oRule.id, modId, func, fRegisterArguments func
	cb
		answ: answ
		module: sandbox.exports
		funcParams: oFuncParams
		funcArgs: oFuncArgs
		logger: sandbox.log

