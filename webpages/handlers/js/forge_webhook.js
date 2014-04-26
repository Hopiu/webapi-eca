// Generated by CoffeeScript 1.7.1
(function() {
  var arrKV, arrParams, fDisplayError, fFailedRequest, fIssueRequest, fOnLoad, fProcessWebhookList, fUpdateWebhookList, hostUrl, oParams, param, _i, _len;

  arrParams = window.location.search.substring(1).split('&');

  oParams = {};

  for (_i = 0, _len = arrParams.length; _i < _len; _i++) {
    param = arrParams[_i];
    arrKV = param.split('=');
    oParams[arrKV[0]] = arrKV[1];
  }

  if (oParams.id) {
    oParams.id = decodeURIComponent(oParams.id);
  }

  hostUrl = [location.protocol, '//', location.host].join('');

  fDisplayError = function(msg) {
    window.scrollTo(0, 0);
    $('#info').text("Error: " + msg);
    return $('#info').attr('class', 'error');
  };

  fIssueRequest = function(args) {
    $('#info').text('');
    return $.post('/usercommand', args.body).done(args.done).fail(args.fail);
  };

  fFailedRequest = function(msg) {
    return function(err) {
      if (err.status === 401) {
        return window.location.href = 'forge?page=forge_rule';
      } else {
        return fDisplayError(msg);
      }
    };
  };

  fUpdateWebhookList = function() {
    return fIssueRequest({
      body: {
        command: 'get_all_webhooks'
      },
      done: fProcessWebhookList,
      fail: fFailedRequest('Unable to get Webhook list')
    });
  };

  fProcessWebhookList = function(data) {
    var hookid, hookname, img, oHooks, tdName, tdUrl, tr, _results;
    $('#table_webhooks tr').remove();
    oHooks = JSON.parse(data.message);
    console.log(hostUrl);
    _results = [];
    for (hookid in oHooks) {
      hookname = oHooks[hookid];
      tr = $('<tr>');
      tdName = $('<div>').text(hookname);
      tdUrl = $('<input>').attr('style', 'width:600px').val("" + hostUrl + "/webhooks/" + hookid);
      img = $('<img>').attr('class', 'del').attr('title', 'Delete Module').attr('src', 'red_cross_small.png');
      tr.append($('<td>').append(img));
      tr.append($('<td>').attr('style', 'padding-left:10px').append(tdName));
      tr.append($('<td>').attr('style', 'padding-left:10px').append(tdUrl));
      _results.push($('#table_webhooks').append(tr));
    }
    return _results;
  };

  fOnLoad = function() {
    document.title = 'Create Webhooks!';
    fUpdateWebhookList();
    $('#but_submit').click(function() {
      var hookname;
      $('#info').text('');
      hookname = $('#inp_hookname').val();
      if (hookname === '') {
        return fDisplayError('Please provide an Event Name for your new Webhook!');
      } else {
        $('#display_hookurl *').remove();
        return fIssueRequest({
          body: {
            command: 'create_webhook',
            body: JSON.stringify({
              hookname: hookname
            })
          },
          done: function(data) {
            var b, div, inp, oAnsw;
            oAnsw = JSON.parse(data.message);
            b = $('<b>').text("This is the Webhook Url you will use for your Event : ");
            $('#display_hookurl').append(b);
            $('#display_hookurl').append($('<br>'));
            inp = $('<input>').attr('type', 'text').attr('style', 'width:600px').val("" + hostUrl + "/webhooks/" + oAnsw.hookid);
            $('#display_hookurl').append(inp);
            $('#display_hookurl').append($('<br>'));
            div = $('<div>');
            div.append($('<br>'));
            div.append($('<div>').html("1. Try it out and push your location to your new webhook via <a target=\"_blank\" href=\"" + hostUrl + "/mobile.html?hookid=" + oAnsw.hookid + "\">this page</a>."));
            div.append($('<br>'));
            div.append($('<div>').html("2. Then you should setup <a target=\"_blank\" href=\"forge?page=forge_rule&eventtype=webhook&hookname=" + hookname + "\">a Rule for this Event!</a>"));
            return $('#display_hookurl').append(div);
          },
          fail: function(err) {
            if (err.status === 409) {
              return fFailedRequest('Webhook Event Name already existing!')(err);
            } else {
              return fFailedRequest('Unable to create Webhook! ' + err.message)(err);
            }
          }
        });
      }
    });
    return $('#table_webhooks').on('click', 'img', function() {
      var arrUrl, url;
      if (confirm("Do you really want to delete this webhook?")) {
        url = $('input', $(this).closest('tr')).val();
        arrUrl = url.split('/');
        return fIssueRequest({
          body: {
            command: 'delete_webhook',
            body: JSON.stringify({
              hookid: arrUrl[arrUrl.length - 1]
            })
          },
          done: function(data) {
            $('#info').text(data.message);
            $('#info').attr('class', 'success');
            return fUpdateWebhookList();
          },
          fail: function(err) {
            fFailedRequest('Unable to delete Webhook!')(err);
            return fUpdateWebhookList();
          }
        });
      }
    });
  };

  window.addEventListener('load', fOnLoad, true);

}).call(this);
