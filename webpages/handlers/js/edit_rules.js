// Generated by CoffeeScript 1.7.1
(function() {
  var fOnLoad;

  fOnLoad = function() {
    var fChangeInputVisibility, fErrHandler, fFetchRules, fUpdateRuleList;
    document.title = 'Edit Rules';
    $('#pagetitle').text("{{{user.username}}}, edit your Rules!");
    fErrHandler = function(errMsg) {
      return function(err) {
        var fDelayed;
        if (err.status === 401) {
          return window.location.href = 'forge?page=edit_rules';
        } else {
          $('#log_col').text("");
          fDelayed = function() {
            var msg, oErr;
            if (err.responseText === '') {
              msg = 'No Response from Server!';
            } else {
              try {
                oErr = JSON.parse(err.responseText);
                msg = oErr.message;
              } catch (_error) {}
            }
            $('#info').text(errMsg + msg);
            return $('#info').attr('class', 'error');
          };
          return setTimeout(fDelayed, 500);
        }
      };
    };
    fFetchRules = function() {
      return $.post('/usercommand', {
        command: 'get_rules'
      }).done(fUpdateRuleList).fail(fErrHandler('Did not retrieve rules! '));
    };
    fUpdateRuleList = function(data) {
      var img, inp, ruleName, tr, _i, _len, _ref, _results;
      $('#tableRules tr').remove();
      _ref = data.message;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        ruleName = _ref[_i];
        tr = $('<tr>');
        img = $('<img>').attr('class', 'del').attr('title', 'Delete Rule').attr('src', 'red_cross_small.png');
        tr.append($('<td>').append(img));
        img = $('<img>').attr('class', 'edit').attr('title', 'Edit Rule').attr('src', 'edit.png');
        tr.append($('<td>').append(img));
        img = $('<img>').attr('class', 'log').attr('title', 'Show Rule Log').attr('src', 'logicon.png');
        tr.append($('<td>').append(img));
        inp = $('<div>').text(ruleName);
        tr.append($('<td>').append(inp));
        _results.push($('#tableRules').append(tr));
      }
      return _results;
    };
    fFetchRules();
    $('#tableRules').on('click', 'img.del', function() {
      var data, ruleName;
      ruleName = $('div', $(this).closest('tr')).text();
      if (confirm("Do you really want to delete the rule '" + ruleName + "'?")) {
        $('#log_col').text("");
        data = {
          command: 'delete_rule',
          payload: {
            id: ruleName
          }
        };
        data.payload = JSON.stringify(data.payload);
        return $.post('/usercommand', data).done(fFetchRules).fail(fErrHandler('Could not delete rule! '));
      }
    });
    $('#tableRules').on('click', 'img.edit', function() {
      var ruleName;
      ruleName = $('div', $(this).closest('tr')).text();
      return window.location.href = 'forge?page=forge_rule&id=' + encodeURIComponent(ruleName);
    });
    $('#tableRules').on('click', 'img.log', function() {
      var data, ruleName;
      ruleName = $('div', $(this).closest('tr')).text();
      data = {
        command: 'get_rule_log',
        payload: {
          id: ruleName
        }
      };
      data.payload = JSON.stringify(data.payload);
      return $.post('/usercommand', data).done(function(data) {
        var log;
        log = data.message.replace(new RegExp("\n", 'g'), "<br>");
        return $('#log_col').html("<h3>" + ruleName + " Log:</h3>" + log);
      }).fail(fErrHandler('Could not get rule log! '));
    });
    fChangeInputVisibility = function() {
      return $('#tableParams tr').each(function(id) {
        if ($(this).is(':last-child' || $(this).is(':only-child'))) {
          $('img', this).hide();
          return $('input[type=checkbox]', this).hide();
        } else {
          $('img', this).show();
          return $('input[type=checkbox]', this).show();
        }
      });
    };
    $('#tableParams').on('click', 'img', function() {
      var par;
      par = $(this).closest('tr');
      if (!par.is(':last-child')) {
        par.remove();
      }
      return fChangeInputVisibility();
    });
    $('#tableParams').on('keyup', 'input', function(e) {
      var cb, code, img, inp, par, tr;
      code = e.keyCode || e.which;
      if (code !== 9) {
        par = $(this).closest('tr');
        if (par.is(':last-child')) {
          tr = $('<tr>');
          img = $('<img>').attr('title', 'Remove?').attr('src', 'red_cross_small.png');
          cb = $('<input>').attr('type', 'checkbox').attr('title', 'Password shielded input?');
          inp = $('<input>').attr('type', 'text').attr('class', 'textinput');
          tr.append($('<td>').append(img));
          tr.append($('<td>').append(cb));
          tr.append($('<td>').append(inp));
          par.parent().append(tr);
          return fChangeInputVisibility();
        } else if ($(this).val() === '' && !par.is(':only-child')) {
          return par.remove();
        }
      }
    });
    return fChangeInputVisibility();
  };

  window.addEventListener('load', fOnLoad, true);

}).call(this);