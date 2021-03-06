$( document ).ready(function() {
  var menubar = $( '#menubar tr' );
  var fRedirect = function( url ) {
    return function() {
      window.location.href = url;
    }
  };

  var fCreateLink = function( text, fAction ) {
    var link = $( '<td>' ).text( text );
    link.click( fAction );
    menubar.append(link);
  };

  fCreateLink( 'Push Event',
    fRedirect( 'forge?page=forge_event' )
  );
  fCreateLink( 'Create Rule',
    fRedirect( 'forge?page=forge_rule' )
  );
  fCreateLink( 'Create Webhooks',
    fRedirect( 'forge?page=forge_webhook' )
  );
  fCreateLink( 'Edit Rules',
    fRedirect( 'forge?page=edit_rules' )
  );
  fCreateLink( 'Create EP',
    fRedirect( 'forge?page=forge_module&type=event_poller' )
  );
  fCreateLink( 'Create AI',
    fRedirect( 'forge?page=forge_module&type=action_invoker' )
  );
  fCreateLink( 'Edit EPs & AIs',
    fRedirect( 'forge?page=edit_modules' )
  );
  //    fCreateLink( 'admin', fRedirect( 'admin' ) );

  fCreateLink( 'Logout',  function() {
    $.post( '/logout' ).done( fRedirect( document.URL ) );
  });
});