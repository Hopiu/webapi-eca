###

Dynamic Modules
===============
> Compiles CoffeeScript modules and loads JS modules in a VM, together
> with only a few allowed node.js modules.
###

# **Loads Modules:**

# - [Logging](logging.html), [Persistence](persistence.html)
# and [Dynamic Modules](dynamic-modules.html)
logger = require './logging'
db = require './persistence'
dynmod = require './dynamic-modules'

# If we do not receive all required arguments we shut down immediately
if process.argv.length < 8
	console.error 'Not all arguments have been passed!'
	process.exit()

# Fetch all the command line arguments to the process to init the logger
logconf =
	mode: process.argv[ 2 ]
	nolog: process.argv[ 6 ]
logconf[ 'io-level' ] = process.argv[ 3 ]
logconf[ 'file-level' ] = process.argv[ 4 ]
logconf[ 'file-path' ] = process.argv[ 5 ]
log = logger.getLogger logconf
log.info 'EP | Event Poller starts up'

# Initialize required modules (should be in cache already)
db logger: log
dynmod
	logger: log
	keygen: process.argv[ 7 ]

# Initialize module local variables and 
listUserModules = {}
isRunning = true

# Register disconnect action. Since no standalone mode is intended
# the event poller will shut down
process.on 'disconnect', () ->
	log.info 'EP | Shutting down Event Poller'
	isRunning = false
	# very important so the process doesnt linger on when the paren process is killed  
	process.exit()

# If the process receives a message it is concerning the rules
process.on 'message', ( msg ) ->

	# Let's split the event string to find module and function in an array

	# A initialization notification or a new rule
	if msg.event is 'new' or msg.event is 'init'
		fLoadModule msg
		# We fetch the module also if the rule was updated

	# A rule was deleted
	if msg.event is 'del'
		delete listUserModules[msg.user][msg.ruleId]
		if JSON.stringify( listUserModules[msg.user] ) is "{}"
			delete listUserModules[msg.user]

# Loads a module if required
fLoadModule = ( msg ) ->
	arrName = msg.rule.event.split ' -> '
	fAnonymous = () ->
		db.eventPollers.getModule arrName[ 0 ], ( err, obj ) ->
			if not obj
				log.warn "EP | Strange... no module retrieved: #{ arrName[0] }"
			else
				 # we compile the module and pass: 
				dynmod.compileString obj.data,  # code
					msg.user,                     # userId
					msg.rule.id,                  # ruleId
					arrName[0],                   # moduleId
					obj.lang,                     # script language
					db.eventPollers,              # the DB interface
					( result ) ->
						if not result.answ is 200
							log.error "EP | Compilation of code failed! #{ msg.user },
								#{ msg.rule.id }, #{ arrName[0] }"

						# If user is not yet stored, we open a new object
						if not listUserModules[msg.user]
							listUserModules[msg.user] = {}
						
						iv = msg.rule.interval * 60 * 1000
						# We open up a new object for the rule it
						listUserModules[msg.user][msg.rule.id] =
							id: msg.rule.event
							pollfunc: arrName[1]
							interval: iv
							module: result.module
							logger: result.logger

						log.info "EP | New event module '#{ arrName[0] }' loaded for user #{ msg.user },
							in rule #{ msg.rule.id }, polling every #{ iv } minutes"
						setTimeout fCheckAndRun( msg.user, msg.rule.id ), iv

	if msg.event is 'new' or
			not listUserModules[msg.user] or 
			not listUserModules[msg.user][msg.rule.id]
		fAnonymous()

fCheckAndRun = ( userId, ruleId ) ->
	() ->
		if isRunning and 
				listUserModules[userId] and 
				listUserModules[userId][ruleId]
			oRule = listUserModules[userId][ruleId]
			fCallFunction userId, ruleId, oRule
			setTimeout fCheckAndRun( userId, ruleId ), oRule.interval

# We have to register the poll function in belows anonymous function
# because we're fast iterating through the listUserModules and references will
# eventually not be what they are expected to be
fCallFunction = ( userId, ruleId, oRule ) ->
	try
		oRule.module[oRule.pollfunc] ( obj ) ->
			db.pushEvent
				event: oRule.id
				eventid: "polled #{ oRule.id } #{ userId }_#{ ( new Date ).toISOString() }"
				payload: obj
	catch err
		log.info "EP | ERROR in module when polled: #{ oRule.id } #{ userId }: #{err.message}"
		oRule.logger err.message
# ###
# This function will loop infinitely every 10 seconds until isRunning is set to false

# @private pollLoop()
# ###
# pollLoop = () ->
#   # We only loop if we're running
#   if isRunning

#     # Go through all users
#     for userName, oRules of listUserModules

#       # Go through each of the users modules
#       for ruleName, myRule of oRules

#         # Call the event poller module function
#         fCallFunction myRule, ruleName, userName

#     setTimeout pollLoop, 10000


# # Finally if everything initialized we start polling for new events
# pollLoop()