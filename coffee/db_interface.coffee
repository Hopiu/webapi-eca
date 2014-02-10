###

DB Interface
============
> Handles the connection to the database and provides functionalities for
> event pollers, action invokers, rules and the encrypted storing of authentication tokens.
> General functionality as a wrapper for the module holds initialization,
> encryption/decryption, the retrieval of modules and shut down.
> 
> The general structure for linked data is that the key is stored in a set.
> By fetching all set entries we can then fetch all elements, which is
> automated in this function.
> For example, modules of the same group, e.g. action invokers are registered in an
> unordered set in the database, from where they can be retrieved again. For example
> a new action invoker has its ID (e.g 'probinder') first registered in the set
> 'action-invokers' and then stored in the db with the key 'action-invoker:' + ID
> (e.g. action-invoker:probinder). 
>

###

# **Requires:**

# - [Logging](logging.html)
log = require './logging'

# - External Modules: [crypto-js](https://github.com/evanvosberg/crypto-js) and
#   [redis](https://github.com/mranney/node_redis)
crypto = require 'crypto-js'
redis = require 'redis'

###
Module call
-----------
Initializes the DB connection. Requires a valid configuration file which contains
a db port and a crypto key.

@param {Object} args
###
exports = module.exports = ( args ) => 
  args = args ? {}
  log args
  config = require './config'
  config args
  @db?.quit()
  if config.isReady()
    @crypto_key = config.getCryptoKey()
    @db = redis.createClient config.getDBPort(),
      'localhost', { connect_timeout: 2000 }
    @db.on 'error', ( err ) ->
      err.addInfo = 'message from DB'
      log.error 'DB', err
    @ep = new IndexedModules( 'event-poller', @db )
    @ai = new IndexedModules( 'action-invoker', @db )
  else
    log.error 'DB', 'Initialization failed because of missing config file!'

###
Checks whether the db is connected and passes either an error on failure after
ten attempts within five seconds, or nothing on success to the callback(err).

@public isConnected( *cb* )
@param {function} cb
###
exports.isConnected = ( cb ) =>
  if @db.connected then cb()
  else
    numAttempts = 0
    fCheckConnection = =>
      if @db.connected
        log.print 'DB', 'Successfully connected to DB!'
        cb()
      else if numAttempts++ < 10
        setTimeout fCheckConnection, 100
      else
        cb new Error 'Connection to DB failed!'
    setTimeout fCheckConnection, 100

###
Abstracts logging for simple action replies from the DB.

@private replyHandler( *action* )
@param {String} action
###
replyHandler = ( action ) ->
  ( err, reply ) ->
    if err
      err.addInfo = "during '#{ action }'"
      log.error 'DB', err
    else
      log.print 'DB', "#{ action }: #{ reply }"

###
Push an event into the event queue.

@public pushEvent( *oEvent* )
@param {Object} oEvent
###
exports.pushEvent = ( oEvent ) =>
  if oEvent
    log.print 'DB', "Event pushed into the queue: '#{ oEvent.eventid }'"
    @db.rpush 'event_queue', JSON.stringify( oEvent )
  else
    log.error 'DB', 'Why would you give me an empty event...'


###
Pop an event from the event queue and pass it to cb(err, obj).

@public popEvent( *cb* )
@param {function} cb
###
exports.popEvent = ( cb ) =>
  makeObj = ( pcb ) ->
    ( err, obj ) ->
      pcb err, JSON.parse( obj )
  @db.lpop 'event_queue', makeObj( cb )
  
###
Purge the event queue.

@public purgeEventQueue()
###
exports.purgeEventQueue = () =>
  @db.del 'event_queue', replyHandler 'purging event queue'  

###
Hashes a string based on SHA-3-512.

@private hash( *plainText* )
@param {String} plainText
###
hash = ( plainText ) => 
  if !plainText? then return null
  try
    ( crypto.SHA3 plainText, { outputLength: 512 } ).toString()
  catch err
    err.addInfo = 'during hashing'
    log.error 'DB', err
    null


###
Encrypts a string using the crypto key from the config file, based on aes-256-cbc.

@private encrypt( *plainText* )
@param {String} plainText
###
encrypt = ( plainText ) => 
  if !plainText? then return null
  try
    crypto.AES.encrypt plainText, @crypto_key
  catch err
    err.addInfo = 'during encryption'
    log.error 'DB', err
    null

###
Decrypts an encrypted string and hands it back on success or null.

@private decrypt( *crypticText* )
@param {String} crypticText
###
decrypt = ( crypticText ) =>
  if !crypticText? then return null;
  try
    dec = crypto.AES.decrypt crypticText, @crypto_key
    dec.toString(crypto.enc.Utf8)
  catch err
    err.addInfo = 'during decryption'
    log.error 'DB', err
    null

###
Fetches all linked data set keys from a linking set, fetches the single
data objects via the provided function and returns the results to cb(err, obj).

@private getSetRecords( *set, fSingle, cb* )
@param {String} set the set name how it is stored in the DB
@param {function} fSingle a function to retrieve a single data element
      per set entry
@param {function} cb the callback(err, obj) function that receives all
      the retrieved data or an error
###
getSetRecords = ( set, fSingle, cb ) =>
  log.print 'DB', "Fetching set records: '#{ set }'"
  # Fetch all members of the set
  @db.smembers set, ( err, arrReply ) ->
    if err
      # If an error happens we return it to the callback function
      err.addInfo = "fetching '#{ set }'"
      log.error 'DB', err
      cb err
    else if arrReply.length == 0
      # If the set was empty we return null to the callback
      cb()
    else
      # We need to fetch all the entries from the set and use a semaphore
      # since the fetching from the DB will happen asynchronously
      semaphore = arrReply.length
      objReplies = {}
      setTimeout ->
        # We use a timeout function to cancel the operation
        # in case the DB does not respond
        if semaphore > 0
          cb new Error "Timeout fetching '#{ set }'"
      , 2000
      fCallback = ( prop ) ->
        # The callback function is required to preprocess the result before
        # handing it to the callback. This especially includes decrementing
        # the semaphore
        ( err, data ) ->
          --semaphore
          if err
            err.addInfo = "fetching single element: '#{ prop }'"
            log.error 'DB', err
          else if not data
            # There was no data behind the key
            log.error 'DB', new Error "Empty key in DB: '#{ prop }'"
          else
            # We found a valid record and add it to the reply object
            objReplies[ prop ] = data
          if semaphore == 0
            # If all fetch calls returned we finally pass the result
            # to the callback
            cb null, objReplies
      # Since we retrieved an array of keys, we now execute the fSingle function
      # on each of them, to retrieve the ata behind the key. Our fCallback function
      # is used to preprocess the answer to determine correct execution
      fSingle reply, fCallback( reply ) for reply in arrReply

class IndexedModules
  constructor: ( @setname, @db ) ->
    log.print 'DB', "Instantiated indexed modules for '#{ @setname }'"

  storeModule: ( mId, data ) =>
    log.print 'DB', "storeModule(#{ @setname }): #{ mId }"
    @db.sadd "#{ @setname }s", mId,
      replyHandler "Storing '#{ @setname }' key '#{ mId }'"
    @db.set "#{ @setname }:#{ mId }", data,
      replyHandler "Storing '#{ @setname }:#{ mId }'"

  getModule: ( mId, cb ) =>
    log.print 'DB', "getModule('#{ @setname }): #{ mId }'"
    @db.get "#{ @setname }:#{ mId }", cb

  getModuleIds: ( cb ) =>
    log.print 'DB', "getModuleIds(#{ @setname })"
    @db.smembers "#{ @setname }s", cb

  getModules: ( cb ) =>
    log.print 'DB', "getModules(#{ @setname })"
    getSetRecords "#{ @setname }s", @getModule, cb

  deleteModule: ( mId ) =>
    log.print 'DB', "deleteModule(#{ @setname }): #{ mId }"
    @db.srem "#{ @setname }s", mId,
      replyHandler "Deleting '#{ @setname }' key '#{ mId }'"
    @db.del "#{ @setname }:#{ mId }",
      replyHandler "Deleting '#{ @setname }:#{ mId }'"

  storeParameters: ( mId, userId, data ) =>
    log.print 'DB', "storeParameters(#{ @setname }): '#{ mId }:#{ userId }'"
    @db.sadd "#{ @setname }-params", "#{ mId }:#{ userId }",
      replyHandler "Storing '#{ @setname }' module parameters key '#{ mId }'"
    @db.set "#{ @setname }-params:#{ mId }:#{ userId }", encrypt(data),
      replyHandler "Storing '#{ @setname }' module parameters '#{ mId }:#{ userId }'"

  getParameters: ( mId, userId, cb ) =>
    log.print 'DB', "getParameters(#{ @setname }): '#{ mId }:#{ userId }'"
    @db.get "#{ @setname }-params:#{ mId }:#{ userId }", ( err, data ) ->
      cb err, decrypt data

  getParametersIds: ( cb ) =>
    log.print 'DB', "getParametersIds(#{ @setname })"
    @db.smembers "#{ @setname }-params", cb

  deleteParameters: ( mId, userId ) =>
    log.print 'DB', "deleteParameters(#{ @setname }): '#{ mId }:#{ userId }'"
    @db.srem "#{ @setname }-params", "#{ mId }:#{ userId }",
      replyHandler "Deleting '#{ @setname }-params' key '#{ mId }:#{ userId }'"
    @db.del "#{ @setname }-params:#{ mId }:#{ userId }",
      replyHandler "Deleting '#{ @setname }-params:#{ mId }:#{ userId }'"


###
## Action Invokers
###

###
Store a string representation of an action invoker in the DB.

@public storeActionInvoker ( *aiId, data* )
@param {String} aiId
@param {String} data
###
exports.storeActionInvoker = ( aiId, data ) =>
  @ai.storeModule( aiId, data )

###
Query the DB for an action invoker and pass it to cb(err, obj).

@public getActionInvoker( *aiId, cb* )
@param {String} aiId
@param {function} cb
###
exports.getActionInvoker = ( aiId, cb ) =>
  @ai.getModule aiId, cb

###
Fetch all action invoker IDs and hand them to cb(err, obj).

@public getActionInvokerIds( *cb* )
@param {function} cb
###
exports.getActionInvokerIds = ( cb ) =>
  @ai.getModuleIds cb

###
Fetch all action invokers and hand them to cb(err, obj).

@public getActionInvokers( *cb* )
@param {function} cb
###
exports.getActionInvokers = ( cb ) =>
  @ai.getModules cb

###
Fetch all action invokers and hand them to cb(err, obj).

@public getActionInvokers( *cb* )
@param {function} cb
###
exports.deleteActionInvoker = ( aiId ) =>
  @ai.deleteModule aiId

###
Store user-specific action invoker parameters .

@public storeActionParams( *userId, aiId, data* )
@param {String} userId
@param {String} aiId
@param {String} data
###
exports.storeActionParams = ( aiId, userId, data ) =>
  @ai.storeParameters aiId, userId, data

###
Query the DB for user-specific action module parameters,
and pass it to cb(err, obj).

@public getActionParams( *userId, aiId, cb* )
@param {String} userId
@param {String} aiId
@param {function} cb
###
exports.getActionParams = ( aiId, userId, cb ) =>
  @ai.getParameters aiId, userId, cb

###
Fetch all action params IDs and hand them to cb(err, obj).

@public getActionParamsIds( *cb* )
@param {function} cb
###
exports.getActionParamsIds = ( cb ) =>
  @ai.getParametersIds cb

###
Fetch all action modules and hand them to cb(err, obj).

@public deleteActionParams( *cb* )
@param {function} cb
###
exports.deleteActionParams = ( aiId, userId ) =>
  @ai.deleteParameters aiId, userId


###
## Event Pollers
###

###
Store a string representation of an event poller in the DB.

@public storeEventPoller ( *epId, data* )
@param {String} epId
@param {String} data
###
exports.storeEventPoller = ( epId, data ) =>
  @ep.storeModule( epId, data )

###
Query the DB for an event poller and pass it to cb(err, obj).

@public getEventPoller( *epId, cb* )
@param {String} epId
@param {function} cb
###
exports.getEventPoller = ( epId, cb ) =>
  @ep.getModule epId, cb

###
Fetch all event poller IDs and hand them to cb(err, obj).

@public getEventPollerIds( *cb* )
@param {function} cb
###
exports.getEventPollerIds = ( cb ) =>
  @ep.getModuleIds cb

###
Fetch all event pollers and hand them to cb(err, obj).

@public getEventPollers( *cb* )
@param {function} cb
###
exports.getEventPollers = ( cb ) =>
  @ep.getModules cb

###
Fetch all event pollers and hand them to cb(err, obj).

@public getEventPollers( *cb* )
@param {function} cb
###
exports.deleteEventPoller = ( epId ) =>
  @ep.deleteModule epId

###
Store user-specific event poller parameters .

@public storeEventParams( *userId, epId, data* )
@param {String} userId
@param {String} epId
@param {String} data
###
exports.storeEventParams = ( epId, userId, data ) =>
  @ep.storeParameters epId, userId, data

###
Query the DB for user-specific event module parameters,
and pass it to cb(err, obj).

@public getEventParams( *userId, epId, cb* )
@param {String} userId
@param {String} epId
@param {function} cb
###
exports.getEventParams = ( epId, userId, cb ) =>
  @ep.getParameters epId, userId, cb

###
Fetch all event params IDs and hand them to cb(err, obj).

@public getEventParamsIds( *cb* )
@param {function} cb
###
exports.getEventParamsIds = ( cb ) =>
  @ep.getParametersIds cb

###
Fetch all event modules and hand them to cb(err, obj).

@public deleteEventParams( *cb* )
@param {function} cb
###
exports.deleteEventParams = ( epId, userId ) =>
  @ep.deleteParameters epId, userId


###
## Rules
###

###
Query the DB for a rule and pass it to cb(err, obj).

@public getRule( *ruleId, cb* )
@param {String} ruleId
@param {function} cb
###
exports.getRule = ( ruleId, cb ) =>
  log.print 'DB', "getRule: '#{ ruleId }'"
  @db.get "rule:#{ ruleId }", cb

###
Fetch all rules and pass them to cb(err, obj).  

@public getRules( *cb* )
@param {function} cb
###
exports.getRules = ( cb ) ->
  log.print 'DB', 'Fetching all Rules'
  getSetRecords 'rules', exports.getRule, cb

###
Fetch all rule IDs and hand it to cb(err, obj).

@public getRuleIds( *cb* )
@param {function} cb
###
exports.getRuleIds = ( cb ) =>
  log.print 'DB', 'Fetching all Rule IDs'
  @db.smembers 'rules', cb

###
Store a string representation of a rule in the DB.

@public storeRule( *ruleId, data* )
@param {String} ruleId
@param {String} data
###
exports.storeRule = ( ruleId, data ) =>
  log.print 'DB', "storeRule: '#{ ruleId }'"
  @db.sadd 'rules', "#{ ruleId }",
    replyHandler "storing rule key '#{ ruleId }'"
  @db.set "rule:#{ ruleId }", data,
    replyHandler "storing rule '#{ ruleId }'"

###
Delete a string representation of a rule.

@public deleteRule( *ruleId, userId* )
@param {String} ruleId
@param {String} userId
###
exports.deleteRule = ( ruleId ) =>
  log.print 'DB', "deleteRule: '#{ ruleId }'"
  @db.srem "rules", ruleId, replyHandler "Deleting rule key '#{ ruleId }'"
  @db.del "rule:#{ ruleId }", replyHandler "Deleting rule '#{ ruleId }'"

  # We also need to delete all references in linked and active users
  @db.smembers "rule:#{ ruleId }:users", ( err, obj ) =>
    delLinkedUserRule = ( userId ) =>
      @db.srem "user:#{ userId }:rules", ruleId,
        replyHandler "Deleting rule key '#{ ruleId }'' in linked user '#{ userId }'"
    delLinkedUserRule( id ) for id in obj
  @db.del "rule:#{ ruleId }:users", replyHandler "Deleting rule '#{ ruleId }' users"

  @db.smembers "rule:#{ ruleId }:active-users", ( err, obj ) =>
    delActiveUserRule = ( userId ) =>
      @db.srem "user:#{ userId }:active-rules", ruleId,
        replyHandler "Deleting rule key '#{ ruleId }' in active user '#{ userId }'"
    delActiveUserRule( id ) for id in obj
  @db.del "rule:#{ ruleId }:active-users",
    replyHandler "Deleting rule '#{ ruleId }' active users"

###
Associate a rule to a user.

@public linkRule( *ruleId, userId* )
@param {String} ruleId
@param {String} userId
###
exports.linkRule = ( ruleId, userId ) =>
  log.print 'DB', "linkRule: '#{ ruleId }' for user '#{ userId }'"
  @db.sadd "rule:#{ ruleId }:users", userId,
    replyHandler "storing user '#{ userId }' for rule key '#{ ruleId }'"
  @db.sadd "user:#{ userId }:rules", ruleId,
    replyHandler "storing rule key '#{ ruleId }' for user '#{ userId }'"

###
Get rules linked to a user and hand it to cb(err, obj).

@public getUserLinkRule( *userId, cb* )
@param {String} userId
@param {function} cb
###
exports.getUserLinkedRules = ( userId, cb ) =>
  log.print 'DB', "getUserLinkedRules: for user '#{ userId }'"
  @db.smembers "user:#{ userId }:rules", cb

###
Get users linked to a rule and hand it to cb(err, obj).

@public getRuleLinkedUsers( *ruleId, cb* )
@param {String} ruleId
@param {function} cb
###
exports.getRuleLinkedUsers = ( ruleId, cb ) =>
  log.print 'DB', "getRuleLinkedUsers: for rule '#{ ruleId }'"
  @db.smembers "rule:#{ ruleId }:users", cb

###
Delete an association of a rule to a user.

@public unlinkRule( *ruleId, userId* )
@param {String} ruleId
@param {String} userId
###
exports.unlinkRule = ( ruleId, userId ) =>
  log.print 'DB', "unlinkRule: '#{ ruleId }:#{ userId }'"
  @db.srem "rule:#{ ruleId }:users", userId,
    replyHandler "removing user '#{ userId }' for rule key '#{ ruleId }'"
  @db.srem "user:#{ userId }:rules", ruleId,
    replyHandler "removing rule key '#{ ruleId }' for user '#{ userId }'"

###
Activate a rule.

@public activateRule( *ruleId, userId* )
@param {String} ruleId
@param {String} userId
###
exports.activateRule = ( ruleId, userId ) =>
  log.print 'DB', "activateRule: '#{ ruleId }' for '#{ userId }'"
  @db.sadd "rule:#{ ruleId }:active-users", userId,
    replyHandler "storing activated user '#{ userId }' in rule '#{ ruleId }'"
  @db.sadd "user:#{ userId }:active-rules", ruleId,
    replyHandler "storing activated rule '#{ ruleId }' in user '#{ userId }'"

###
Get rules activated for a user and hand it to cb(err, obj).

@public getUserLinkRule( *userId, cb* )
@param {String} userId
@param {function} cb
###
exports.getUserActivatedRules = ( userId, cb ) =>
  log.print 'DB', "getUserActivatedRules: for user '#{ userId }'"
  @db.smembers "user:#{ userId }:active-rules", cb

###
Get users activated for a rule and hand it to cb(err, obj).

@public getRuleActivatedUsers ( *ruleId, cb* )
@param {String} ruleId
@param {function} cb
###
exports.getRuleActivatedUsers = ( ruleId, cb ) =>
  log.print 'DB', "getRuleLinkedUsers: for rule '#{ ruleId }'"
  @db.smembers "rule:#{ ruleId }:active-users", cb

###
Deactivate a rule.

@public deactivateRule( *ruleId, userId* )
@param {String} ruleId
@param {String} userId
###
exports.deactivateRule = ( ruleId, userId ) =>
  log.print 'DB', "deactivateRule: '#{ ruleId }' for '#{ userId }'"
  @db.srem "rule:#{ ruleId }:active-users", userId,
    replyHandler "removing activated user '#{ userId }' in rule '#{ ruleId }'"
  @db.srem "user:#{ userId }:active-rules", ruleId,
    replyHandler "removing activated rule '#{ ruleId }' in user '#{ userId }'"

###
Fetch all active ruleIds and pass them to cb(err, obj).

@public getAllActivatedRuleIds( *cb* )
@param {function} cb
###
exports.getAllActivatedRuleIdsPerUser = ( cb ) =>
  log.print 'DB', "Fetching all active rules"
  @db.smembers 'users', ( err, obj ) =>
    result = {}
    console.log 'checking length'
    if obj.length is 0
      console.log 'length cehcked is 0'
      cb null, result
    else
      console.log 'length cehcked'
      semaphore = obj.length
      fFetchActiveUserRules = ( userId ) =>
        @db.smembers "user:#{ user }:active-rules", ( err, obj ) =>
          console.log obj
          console.log obj.length
          if obj.length is 0
            console.log 'is 0'
          else
            result[userId] = obj
          if --semaphore is 0
            cb null, result
      fFetchActiveUserRules(user) for user in obj

  
###
Fetch all active rules and pass them to cb(err, obj).

@public getAllActivatedRules( *cb* )
@param {function} cb
###
exports.getAllActivatedRules = ( cb ) =>
  log.print 'DB', "Fetching all active rules"
  fCb = ( err, obj ) ->
    console.log 'fetched something'
    console.log err
    console.log obj
  @db.smembers 'users', ( err, obj ) =>
    getSetRecords "user:#{ user }:active-rules", exports.getRule, fCb for user in obj

###
Store a user object (needs to be a flat structure).

@public storeUser( *objUser* )
@param {Object} objUser
###
exports.storeUser = ( objUser ) =>
  #TODO Only store user if not already existing, or at least only then add a private key
  #for his encryption. we would want to have one private key per user, right?  
  log.print 'DB', "storeUser: '#{ objUser.username }'"
  if objUser and objUser.username and objUser.password
    @db.sadd 'users', objUser.username,
      replyHandler "storing user key '#{ objUser.username }'"
    objUser.password = hash objUser.password
    @db.hmset "user:#{ objUser.username }", objUser,
      replyHandler "storing user properties '#{ objUser.username }'"
  else
    log.error 'DB', new Error 'username or password was missing'

###
Associate a role with a user.

@public storeUserRole( *userId, role* )
@param {String} userId
@param {String} role
###
exports.storeUserRole = ( userId, role ) =>
  log.print 'DB', "storeUserRole: '#{ userId }:#{ role }'"
  @db.sadd 'roles', role, replyHandler "adding role '#{ role }' to role index set"
  @db.sadd "user:#{ userId }:roles", role,
    replyHandler "adding role '#{ role }' to user '#{ userId }'"
  @db.sadd "role:#{ role }:users", userId,
    replyHandler "adding user '#{ userId }' to role '#{ role }'"

###
Fetch all roles of a user and pass them to cb(err, obj).

@public getUserRoles( *userId* )
@param {String} userId
###
exports.getUserRoles = ( userId ) =>
  log.print 'DB', "getUserRole: '#{ userId }'"
  @db.get "user-roles:#{ userId }", cb
  
###
Fetch all users of a role and pass them to cb(err, obj).

@public getUserRoles( *role* )
@param {String} role
###
exports.getRoleUsers = ( role ) =>
  log.print 'DB', "getRoleUsers: '#{ role }'"
  @db.get "role-users:#{ role }", cb

###
Checks the credentials and on success returns the user object to the
callback(err, obj) function. The password has to be hashed (SHA-3-512)
beforehand by the instance closest to the user that enters the password,
because we only store hashes of passwords for safety reasons.

@public loginUser( *userId, password, cb* )
@param {String} userId
@param {String} password
@param {function} cb
###
#TODO verify and test whole function
exports.loginUser = ( userId, password, cb ) =>
  log.print 'DB', "User '#{ userId }' tries to log in"
  fCheck = ( pw ) ->
    ( err, obj ) ->
      if err 
        cb err
      else if obj and obj.password
        if pw == obj.password
          log.print 'DB', "User '#{ obj.username }' logged in!" 
          cb null, obj
        else
          cb new Error 'Wrong credentials!'
      else
        cb new Error 'User not found!'
  @db.hgetall "user:#{ userId }", fCheck password

###
Deletes a user and all his associated linked and active rules.

@public deleteUser( *userId* )
@param {String} userId
###
exports.deleteUser = ( userId ) =>
  log.print 'DB', "deleteUser: '#{ userId }'"
  @db.srem "users", userId, replyHandler "Deleting user key '#{ userId }'"
  @db.del "user:#{ userId }", replyHandler "Deleting user '#{ userId }'"

  # We also need to delete all linked rules
  @db.smembers "user:#{ userId }:rules", ( err, obj ) =>
    delLinkedRuleUser = ( ruleId ) =>
      @db.srem "rule:#{ ruleId }:users", userId,
        replyHandler "Deleting user key '#{ userId }' in linked rule '#{ ruleId }'"
    delLinkedRuleUser( id ) for id in obj
  @db.del "user:#{ userId }:rules",
    replyHandler "Deleting user '#{ userId }' rules"

  # We also need to delete all active rules
  @db.smembers "user:#{ userId }:rules", ( err, obj ) =>
    delActivatedRuleUser = ( ruleId ) =>
      @db.srem "rule:#{ ruleId }:active-users", userId,
        replyHandler "Deleting user key '#{ userId }' in active rule '#{ ruleId }'"
    delActivatedRuleUser( id ) for id in obj
  @db.del "user:#{ userId }:active-rules", replyHandler "Deleting user '#{ userId }' rules"


#TODO implement functions required for user sessions?

###
Shuts down the db link.

@public shutDown()
###
exports.shutDown = => @db.quit()
