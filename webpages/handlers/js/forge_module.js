// Generated by CoffeeScript 1.7.1
(function() {
  var arrKV, arrParams, fErrHandler, fOnLoad, moduleName, oParams, param, _i, _len;

  arrParams = window.location.search.substring(1).split('&');

  oParams = {};

  for (_i = 0, _len = arrParams.length; _i < _len; _i++) {
    param = arrParams[_i];
    arrKV = param.split('=');
    oParams[arrKV[0]] = arrKV[1];
  }

  if (oParams.type === 'event_poller') {
    moduleName = 'Event Poller';
  } else {
    moduleName = 'Action Invoker';
    oParams.type = 'action_invoker';
  }

  if (oParams.id) {
    oParams.id = decodeURIComponent(oParams.id);
  }

  fErrHandler = function(errMsg) {
    return function(err) {
      var fDelayed;
      if (err.status === 401) {
        return window.location.href = "forge?page=forge_module?type=" + oParams.type;
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

  fOnLoad = function() {
    var editor, fAddInputRow, fAddUserParam, fChangeInputVisibility, obj;
    document.title = "Forge " + moduleName;
    $('#pagetitle').text("{{{user.username}}}, forge your custom " + moduleName + "!");
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.getSession().setMode("ace/mode/coffee");
    editor.setShowPrintMargin(false);
    editor.session.setUseSoftTabs(false);
    $('#editor_mode').change(function(el) {
      if ($(this).val() === 'CoffeeScript') {
        return editor.getSession().setMode("ace/mode/coffee");
      } else {
        return editor.getSession().setMode("ace/mode/javascript");
      }
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
    fAddInputRow = function(tag) {
      var cb, img, inp, tr;
      tr = $('<tr>');
      img = $('<img>').attr('title', 'Remove?').attr('src', 'red_cross_small.png');
      cb = $('<input>').attr('type', 'checkbox').attr('title', 'Password shielded input?');
      inp = $('<input>').attr('type', 'text').attr('class', 'textinput');
      tr.append($('<td>').append(img));
      tr.append($('<td>').append(cb));
      tr.append($('<td>').append(inp));
      tag.append(tr);
      fChangeInputVisibility();
      return tr;
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
      var code, par;
      code = e.keyCode || e.which;
      if (code !== 9) {
        par = $(this).closest('tr');
        if (par.is(':last-child')) {
          return fAddInputRow(par.parent());
        } else if ($(this).val() === '' && !par.is(':only-child')) {
          return par.remove();
        }
      }
    });
    fChangeInputVisibility();
    $('#but_submit').click(function() {
      var fCheckOverwrite, listParams, obj;
      if ($('#input_id').val() === '') {
        return alert("Please enter an " + moduleName + " name!");
      } else {
        listParams = {};
        $('#tableParams tr').each(function() {
          var shld, val;
          val = $('input.textinput', this).val();
          shld = $('input[type=checkbox]', this).is(':checked');
          if (val !== "") {
            listParams[val] = shld;
          }
          return true;
        });
        obj = {
          command: "forge_" + oParams.type,
          payload: JSON.stringify({
            id: $('#input_id').val(),
            lang: $('#editor_mode').val(),
            "public": $('#is_public').is(':checked'),
            data: editor.getValue(),
            params: JSON.stringify(listParams)
          })
        };
        fCheckOverwrite = function(obj) {
          return function(err) {
            var payl;
            if (err.status === 409) {
              if (confirm('Are you sure you want to overwrite the existing module?')) {
                payl = JSON.parse(obj.payload);
                payl.overwrite = true;
                obj.payload = JSON.stringify(payl);
                return $.post('/usercommand', obj).done(function(data) {
                  $('#info').text(data.message);
                  $('#info').attr('class', 'success');
                  return alert("You need to update the rules that use this module in order for the changes to be applied to them!");
                }).fail(fErrHandler("" + moduleName + " not stored!"));
              }
            } else {
              return fErrHandler("" + moduleName + " not stored!")(err);
            }
          };
        };
        window.scrollTo(0, 0);
        return $.post('/usercommand', obj).done(function(data) {
          $('#info').text(data.message);
          return $('#info').attr('class', 'success');
        }).fail(fCheckOverwrite(obj));
      }
    });
    fAddUserParam = function(param, shielded) {
      var tr;
      tr = fAddInputRow($('#tableParams'));
      $('input.textinput', tr).val(param);
      if (shielded) {
        return $('input[type=checkbox]', tr).prop('checked', true);
      }
    };
    if (oParams.id) {
      obj = {
        command: "get_full_" + oParams.type,
        payload: JSON.stringify({
          id: oParams.id
        })
      };
      return $.post('/usercommand', obj).done(function(data) {
        var oMod, shielded, _ref;
        oMod = JSON.parse(data.message);
        if (oMod) {
          _ref = JSON.parse(oMod.params);
          for (param in _ref) {
            shielded = _ref[param];
            fAddUserParam(param, shielded);
          }
          $('#input_id').val(oMod.id);
          $('#editor_mode').val(oMod.lang);
          if (oMod["public"] === 'true') {
            $('#is_public').prop('checked', true);
          }
          editor.setValue(oMod.data);
          editor.moveCursorTo(0, 0);
        }
        return fAddUserParam('', false);
      }).fail(fErrHandler("Could not get module " + oParams.id + "!"));
    } else {
      editor.setValue($("#template_" + oParams.type).text());
      editor.moveCursorTo(0, 0);
      if (oParams.type === 'event_poller') {
        $('#input_id').val('EmailYak');
        fAddUserParam('apikey', true);
        return fAddUserParam('', false);
      } else {
        $('#input_id').val('ProBinder');
        fAddUserParam('username', false);
        fAddUserParam('password', true);
        return fAddUserParam('', false);
      }
    }
  };

  window.addEventListener('load', fOnLoad, true);

}).call(this);
