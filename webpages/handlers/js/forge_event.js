// Generated by CoffeeScript 1.7.1
(function() {
  var fOnLoad;

  fOnLoad = function() {
    var editor;
    document.title = 'Event Forge!';
    $('#pagetitle').text('Invoke your custom event!');
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.getSession().setMode("ace/mode/json");
    editor.setShowPrintMargin(false);
    $('#editor').css('height', '400px');
    $('#editor').css('width', '600px');
    return $('#but_submit').click(function() {
      var err, val;
      try {
        val = editor.getValue();
        JSON.parse(val);
        return $.post('/event', val).done(function(data) {
          $('#info').text(data.message);
          return $('#info').attr('class', 'success');
        }).fail(function(err) {
          var fDelayed;
          fDelayed = function() {
            if (err.responseText === '') {
              err.responseText = 'No Response from Server!';
            }
            $('#info').text('Error in upload: ' + err.responseText);
            $('#info').attr('class', 'error');
            if (err.status === 401) {
              return window.location.href = 'forge?page=forge_event';
            }
          };
          return setTimeout(fDelayed, 500);
        });
      } catch (_error) {
        err = _error;
        $('#info').text('You have errors in your JSON object! ' + err);
        return $('#info').attr('class', 'error');
      }
    });
  };

  window.addEventListener('load', fOnLoad, true);

}).call(this);
