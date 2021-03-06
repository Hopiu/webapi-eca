###

Components Manager
==================
> The components manager takes care of the dynamic JS modules and the rules.
> Event Poller and Action Invoker modules are loaded as strings and stored in the database,
> then compiled into node modules and rules and used in the engine and event poller.

###

# **Loads Modules:**

# - [Persistence](persistence.html)
db = require './persistence'
# - [Dynamic Modules](dynamic-modules.html)
dynmod = require './dynamic-modules'
# - [Encryption](encryption.html)
encryption = require './encryption'
# - [Request Handler](request-handler.html)
rh = require './request-handler'

# - Node.js Modules: [fs](http://nodejs.org/api/fs.html),
#   [path](http://nodejs.org/api/path.html) and
#   [events](http://nodejs.org/api/events.html)
fs = require 'fs'
path = require 'path'
events = require 'events'
eventEmitter = new events.EventEmitter()

###
Module call
-----------
Initializes the Components Manager and constructs a new Event Emitter.

@param {Object} args
###
exports = module.exports = ( args ) =>
	@log = args.logger
	db args
	dynmod args
	module.exports


###
Add an event handler (eh) that listens for rules.

@public addRuleListener ( *eh* )
@param {function} eh
###

exports.addRuleListener = ( eh ) =>
	eventEmitter.addListener 'rule', eh

	# Fetch all active rules per user
	db.getAllActivatedRuleIdsPerUser ( err, objUsers ) =>

		# Go through all rules of each user
		fGoThroughUsers = ( user, rules ) =>

			# Fetch the rules object for each rule in each user
			fFetchRule = ( userName ) =>
				( rule ) =>
					db.getRule rule, ( err, strRule ) =>
						try 
							oRule = JSON.parse strRule
							db.resetLog userName, oRule.id
							eventInfo = ''
							if oRule.eventstart
                eventInfo = "Starting at #{ new Date( oRule.eventstart ) },
                		Interval set to #{ oRule.eventinterval } minutes"
							db.appendLog userName, oRule.id, "INIT", "Rule '#{ oRule.id }' initialized. #{ eventInfo }"

							eventEmitter.emit 'rule',
								intevent: 'init'
								user: userName
								rule: oRule
						catch err
							@log.warn "CM | There's an invalid rule in the system: #{ strRule }"

			# Go through all rules for each user
			fFetchRule( user ) rule for rule in rules
					
		# Go through each user
		fGoThroughUsers user, rules for user, rules of objUsers

###
Processes a user request coming through the request-handler.

- `user` is the user object as it comes from the DB.
- `oReq` is the request object that contains:

	- `command` as a string 
	- `body` an optional stringified JSON object 
The callback function `callback( obj )` will receive an object
containing the HTTP response code and a corresponding message.

@public processRequest ( *user, oReq, callback* )
###
exports.processRequest = ( user, oReq, callback ) ->
	if not oReq.body
		oReq.body = '{}'
	try
		dat = JSON.parse oReq.body
	catch err
		return callback
			code: 404
			message: 'You had a strange body in your request!'
	if commandFunctions[oReq.command]

		# If the command function was registered we invoke it
		commandFunctions[oReq.command] user, dat, callback
	else
		callback
			code: 404
			message: 'What do you want from me?'

###
Checks whether all required parameters are present in the body.

@private hasRequiredParams ( *arrParams, oBody* )
@param {Array} arrParams
@param {Object} oBody
###
hasRequiredParams = ( arrParams, oBody ) ->
	answ =
		code: 400
		message: "Your request didn't contain all necessary fields! Requires: #{ arrParams.join() }"
	return answ for param in arrParams when not oBody[param]
	answ.code = 200
	answ.message = 'All required properties found'
	answ

###
Fetches all available modules and return them together with the available functions.

@private getModules ( *user, oBody, dbMod, callback* )
@param {Object} user
@param {Object} oBody
@param {Object} dbMod
@param {function} callback
###
getModules = ( user, oBody, dbMod, callback ) ->
	fProcessIds = ( userName ) ->
		( err, arrNames ) ->
			oRes = {}
			answReq = () ->
				callback
					code: 200
					message: JSON.stringify oRes
			sem = arrNames.length
			if sem is 0
				answReq()
			else
				fGetFunctions = ( id ) =>
					dbMod.getModule userName, id, ( err, oModule ) =>
						if oModule
							oRes[id] = JSON.parse oModule.functions
						if --sem is 0
							answReq()
				fGetFunctions id for id in arrNames

	dbMod.getAvailableModuleIds user.username, fProcessIds user.username

getModuleParams = ( user, oBody, dbMod, callback ) ->
	answ = hasRequiredParams [ 'id' ], oBody
	if answ.code isnt 200
		callback answ
	else
		dbMod.getModuleField user.username, oBody.id, "params", ( err, oBody ) ->
			answ.message = oBody
			callback answ

getModuleUserParams = ( user, oBody, dbMod, callback ) ->
	answ = hasRequiredParams [ 'id' ], oBody
	if answ.code isnt 200
		callback answ
	else
		dbMod.getUserParams oBody.id, user.username, ( err, str ) ->
			oParams = JSON.parse str
			for name, oParam of oParams
				if not oParam.shielded
					oParam.value = encryption.decrypt oParam.value
			answ.message = JSON.stringify oParams
			callback answ

getModuleUserArguments = ( user, oBody, dbMod, callback ) ->
	answ = hasRequiredParams [ 'ruleId' ,'moduleId' ], oBody
	if answ.code isnt 200
		callback answ
	else
		dbMod.getAllModuleUserArguments user.username, oBody.ruleId, oBody.moduleId, ( err, oBody ) ->
			answ.message = oBody
			callback answ

forgeModule = ( user, oBody, modType, dbMod, callback ) =>
	answ = hasRequiredParams [ 'id', 'params', 'lang', 'data' ], oBody
	if answ.code isnt 200
		callback answ
	else
		if oBody.overwrite
			storeModule user, oBody, modType, dbMod, callback
		else
			dbMod.getModule user.username, oBody.id, ( err, mod ) =>
				if mod
					answ.code = 409
					answ.message = 'Module name already existing: ' + oBody.id
					callback answ
				else
					storeModule user, oBody, modType, dbMod, callback

storeModule = ( user, oBody, modType, dbMod, callback ) =>
	src = oBody.data
	dynmod.compileString src, user.username, id: 'dummyRule' , oBody.id, oBody.lang, modType, null, ( cm ) =>
		answ = cm.answ
		if answ.code is 200
			funcs = []
			funcs.push name for name, id of cm.module
			@log.info "CM | Storing new module with functions #{ funcs.join( ', ' ) }"
			answ.message = 
				" Module #{ oBody.id } successfully stored! Found following function(s): #{ funcs }"
			oBody.functions = JSON.stringify funcs
			oBody.functionArgs = JSON.stringify cm.funcParams
			dbMod.storeModule user.username, oBody
			# if oBody.public is 'true'
			# 	dbMod.publish oBody.id
		callback answ

# Store a rule and inform everybody about it
# ------------------------------------------
storeRule = ( user, oBody, callback ) =>
	# This is how a rule is stored in the database
		rule =
			id: oBody.id
			eventtype: oBody.eventtype
			eventname: oBody.eventname
			eventstart: oBody.eventstart
			eventinterval: oBody.eventinterval
			conditions: oBody.conditions
			actions: oBody.actions
		if oBody.eventstart
			rule.timestamp = (new Date()).toISOString()
		strRule = JSON.stringify rule
		# store the rule
		db.storeRule rule.id, strRule
		# link the rule to the user
		db.linkRule rule.id, user.username
		# activate the rule
		db.activateRule rule.id, user.username
		# if event module parameters were sent, store them
		if oBody.eventparams
			epModId = rule.eventname.split( ' -> ' )[ 0 ]
			db.eventPollers.storeUserParams epModId, user.username, JSON.stringify oBody.eventparams
		oFuncArgs = oBody.eventfunctions
		# if event function arguments were sent, store them
		for id, args of oFuncArgs
			arr = id.split ' -> '
			db.eventPollers.storeUserArguments user.username, rule.id, arr[ 0 ], arr[ 1 ], JSON.stringify args 
		
		# if action module params were sent, store them
		oParams = oBody.actionparams
		for id, params of oParams
			db.actionInvokers.storeUserParams id, user.username, JSON.stringify params
		oFuncArgs = oBody.actionfunctions
		# if action function arguments were sent, store them
		for id, args of oFuncArgs
			arr = id.split ' -> '
			db.actionInvokers.storeUserArguments user.username, rule.id, arr[ 0 ], arr[ 1 ], JSON.stringify args 
		
		eventInfo = ''
		if rule.eventstart
			eventInfo = "Starting at #{ new Date( rule.eventstart ) }, Interval set to #{ rule.eventinterval } minutes"
		# Initialize the rule log
		db.resetLog user.username, rule.id
		db.appendLog user.username, rule.id, "INIT", "Rule '#{ rule.id }' initialized. #{ eventInfo }"
		
		# Inform everbody about the new rule
		eventEmitter.emit 'rule',
			intevent: 'new'
			user: user.username
			rule: rule
		callback
			code: 200
			message: "Rule '#{ rule.id }' stored and activated!"


#
# COMMAND FUNCTIONS
# =================
#
# Those are the answers to user requests.

commandFunctions =
	get_public_key: ( user, oBody, callback ) ->
		callback
			code: 200
			message: encryption.getPublicKey()

# EVENT POLLERS
# -------------
	get_event_pollers: ( user, oBody, callback ) ->
		getModules  user, oBody, db.eventPollers, callback
	
	get_full_event_poller: ( user, oBody, callback ) ->
		db.eventPollers.getModule user.username, oBody.id, ( err, obj ) ->
			callback
				code: 200
				message: JSON.stringify obj
	
	get_event_poller_params: ( user, oBody, callback ) ->
		getModuleParams user, oBody, db.eventPollers, callback

	get_event_poller_user_params: ( user, oBody, callback ) ->
		getModuleUserParams user, oBody, db.eventPollers, callback

	get_event_poller_user_arguments: ( user, oBody, callback ) ->
		getModuleUserArguments user, oBody, db.eventPollers, callback

	get_event_poller_function_arguments: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'id' ], oBody
		if answ.code isnt 200
			callback answ
		else
			db.eventPollers.getModuleField user.username, oBody.id, 'functionArgs', ( err, obj ) ->
				callback
					code: 200
					message: obj
	
	forge_event_poller: ( user, oBody, callback ) ->
		forgeModule user, oBody, "eventpoller", db.eventPollers, callback
 
	delete_event_poller: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'id' ], oBody
		if answ.code isnt 200
			callback answ
		else
			db.eventPollers.deleteModule user.username, oBody.id
			callback
				code: 200
				message: 'OK!'

# ACTION INVOKERS
# ---------------
	get_action_invokers: ( user, oBody, callback ) ->
		getModules  user, oBody, db.actionInvokers, callback
	
	get_full_action_invoker: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'id' ], oBody
		if answ.code isnt 200
			callback answ
		else
			db.actionInvokers.getModule user.username, oBody.id, ( err, obj ) ->
				callback
					code: 200
					message: JSON.stringify obj

	get_action_invoker_params: ( user, oBody, callback ) ->
		getModuleParams user, oBody, db.actionInvokers, callback

	get_action_invoker_user_params: ( user, oBody, callback ) ->
		getModuleUserParams user, oBody, db.actionInvokers, callback

	get_action_invoker_user_arguments: ( user, oBody, callback ) ->
		getModuleUserArguments user, oBody, db.actionInvokers, callback

	get_action_invoker_function_arguments: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'id' ], oBody
		if answ.code isnt 200
			callback answ
		else
			db.actionInvokers.getModuleField user.username, oBody.id, 'functionArgs', ( err, obj ) ->
				callback
					code: 200
					message: obj
	
	forge_action_invoker: ( user, oBody, callback ) ->
		forgeModule user, oBody, "actioninvoker", db.actionInvokers, callback

	delete_action_invoker: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'id' ], oBody
		if answ.code isnt 200
			callback answ
		else
			db.actionInvokers.deleteModule user.username, oBody.id
			callback
				code: 200
				message: 'OK!'

# RULES
# -----
	get_rules: ( user, oBody, callback ) ->
		db.getUserLinkedRules user.username, ( err, obj ) ->
			callback
				code: 200
				message: obj

	get_rule: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'id' ], oBody
		if answ.code isnt 200
			callback answ
		else
			db.getRule oBody.id, ( err, obj ) ->
				callback
					code: 200
					message: obj

	get_rule_log: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'id' ], oBody
		if answ.code isnt 200
			callback answ
		else
			db.getLog user.username, oBody.id, ( err, obj ) ->
				callback
					code: 200
					message: obj

	# A rule needs to be in following format:
	
	# - id
	# - event
	# - conditions
	# - actions
	forge_rule: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'id', 'eventname', 'conditions', 'actions' ], oBody
		if answ.code isnt 200
			callback answ
		else
			if oBody.overwrite
				storeRule user, oBody, callback
			else
				db.getRule oBody.id, ( err, mod ) =>
					if mod
						answ.code = 409
						answ.message = 'Rule name already existing: ' + oBody.id
						callback answ
					else
						storeRule user, oBody, callback

	delete_rule: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'id' ], oBody
		if answ.code isnt 200
			callback answ
		else
			db.deleteRule oBody.id
			eventEmitter.emit 'rule',
				intevent: 'del'
				user: user.username
				rule: null
				ruleId: oBody.id
			callback
				code: 200
				message: 'OK!'


# WEBHOOKS
# --------
	create_webhook: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'hookname' ], oBody
		if answ.code isnt 200
			callback answ
		else
			db.getAllUserWebhookNames user.username, ( err, arrHooks ) =>
				hookExists = false
				hookExists = true for hookid, hookname of arrHooks when hookname is oBody.hookname
				if hookExists
					callback
						code: 409
						message: 'Webhook already existing: ' + oBody.hookname
				else
					db.getAllWebhookIDs ( err, arrHooks ) ->
						genHookID = ( arrHooks ) ->
							hookid = ''
							for i in [ 0..1 ]
								hookid += Math.random().toString( 36 ).substring 2
							if arrHooks and arrHooks.indexOf( hookid ) > -1
								hookid = genHookID arrHooks
							hookid
						hookid = genHookID arrHooks
						db.createWebhook user.username, hookid, oBody.hookname
						rh.activateWebhook user.username, hookid, oBody.hookname
						callback
							code: 200
							message: JSON.stringify
								hookid: hookid
								hookname: oBody.hookname

	get_all_webhooks: ( user, oBody, callback ) ->
		db.getAllUserWebhookNames user.username, ( err, data ) ->
			if err
				callback
					code: 400
					message: "We didn't like your request!"
			else
				data = JSON.stringify( data ) || null
				callback
					code: 200
					message: data

	delete_webhook: ( user, oBody, callback ) ->
		answ = hasRequiredParams [ 'hookid' ], oBody
		if answ.code isnt 200
			callback answ
		else
			rh.deactivateWebhook oBody.hookid
			db.deleteWebhook user.username, oBody.hookid
			callback
				code: 200
				message: 'OK!'
		