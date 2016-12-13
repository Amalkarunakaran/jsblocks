define([
  '../core',
  '../modules/Request',
  '../query/var/dataIdAttr',
  '../query/DomQuery',
  '../query/VirtualElement',
  '../mvc/Application',
  './parseToVirtual',
  '../modules/Escape'
], function (blocks, Request, dataIdAttr, DomQuery, VirtualElement, Application, parseToVirtual, Escape) {
  var eachQuery = blocks.queries.each.preprocess;

  blocks.queries.each.preprocess = function (domQuery, collection) {
    if (!server.data[this._attributes[dataIdAttr]]) {
      removeDataIds(this);
      server.data[this._attributes[dataIdAttr]] = this.renderChildren();
    }

    eachQuery.call(this, domQuery, collection);
  };

  function removeDataIds(element) {
    var children = element._template || element._children;
    blocks.each(children, function (child) {
      if (VirtualElement.Is(child)) {
        child._attributes['data-id'] = null;
        removeDataIds(child);
      }
    });
  }

  blocks.query = function (model) {
    var domQuery = new DomQuery(model);
    var children = parseToVirtual(server.html);

    domQuery.pushContext(model);

    renderChildren(children, domQuery);
  };

  function renderChildren(children, domQuery) {
    var body = findByTagName(children, 'body');
    var head = findByTagName(children, 'head');
    var root = VirtualElement();

    root._children = children;
    body._parent = null;
    body.render(domQuery);

    server.await(function () {
      if (head) {
        if (server.options.baseTag) {
          head.children().splice(0, 0, getBaseTag());
        }
      }
      body.attr('data-blocks-server-data', JSON.stringify(server.data));
      server.rendered = root.renderChildren();
    });
  }

  function findByTagName(children, tagName) {
    var result;

    blocks.each(children, function(child) {
      if (VirtualElement.Is(child)) {
        if (child.tagName() == tagName) {
          result = child;
          return false;
        } else {
          result = findByTagName(child.children(), tagName);
        }
      }
    });

    return result;
  }

  function getBaseTag() {
    var baseUrl = window.location.protocol + '//' + window.location.host +  window.__baseUrl__ + '/';
    return VirtualElement('base').attr('href', baseUrl);
  }

  var executeExpressionValue = Expression.Execute;
  var commentRegEx = /^<!-- ([0-9]+):/;

  Expression.Execute = function (context, elementData, expressionData, entireExpression) {
    var value = executeExpressionValue(context, elementData, expressionData, entireExpression);
    var regExResult = commentRegEx.exec(value);

    if (regExResult) {
      elementData = ElementsData.byId(regExResult[1]);
    }

    if (elementData) {
      if (expressionData.attributeName) {
        server.data[elementData.id + expressionData.attributeName] =  entireExpression.text;
      } else {
        server.data[elementData.id] = '{{' + expressionData.expression + '}}';
      }
    }

    return value;
  };

  Application.prototype._prepare = function () {
    server.application = this;
  };

  Application.prototype._viewsReady = blocks.noop;

  var viewQuery = blocks.queries.view.preprocess;

  blocks.queries.view.preprocess = function (domQuery, view) {
    viewQuery.call(this, domQuery, view);
    if (view._html && server.application && server.application.options.history == 'pushState') {
      this._children = parseToVirtual(view._html);
    }
  };

  blocks.queries.template.preprocess = function (domQuery, html, value) {
    if (blocks.isObject(html)) {
      if (VirtualElement.Is(html.rawValue)) {
        html = html.rawValue.html();
      } else {
        html =  GLOBAL[html.rawValue] && GLOBAL[html.rawValue].html();
      }
    }

    if (blocks.isObject(value) && value.parameterName) {
      value = value.rawValue;
    }

    if (html) {
      if (value) {
        blocks.queries['with'].preprocess.call(this, domQuery, value, '$template');
      }
      this.html(html);
      if (!this._each) {
        this._children = parseToVirtual(this.html());
        this._innerHTML = null;
      }
      server.data.templates = server.data.templates || {};
      server.data.templates[ElementsData.id(this)] = true;
    }
  };

  blocks.observable.fn.array.reset = function (array) {
    this.removeAll();

    if (arguments.length > 0) {
      this.addMany(blocks.unwrap(array));
    }

    return this;
  };

  var http = require('http');
  var fs = require('fs');
  var path = require('path');
  var reIsExternal = /^(www|http)/;
  Request.prototype.execute = function () {
    var _this = this;
    var options = this.options;
    var url = options.url;
    var relativeUrl;
    var requests;
    var views;

    if (options.type == 'GET' && options.data) {
      this.appendDataToUrl(options.data);
    }

    if (reIsExternal.test(url)) {
      // TODO implement
      // think about cacheing with etag and/or cache-headers
    } else {
      relativeUrl = path.join(server.options.static, url);
      if (this.options.isView) {
        views = server.data.views = server.data.views || {};
        views[url] = true;
        this.callSuccess(fs.readFileSync(relativeUrl, {encoding: 'utf-8'}));
      } else if (this.options.async === false) {

      } else {

        server.wait();
        fs.readFile(relativeUrl, { encoding: 'utf-8' }, function (err, contents) {
          requests = server.data.requests = server.data.requests || {};
          requests[url] = contents;
          if (err) {
            _this.callError(err);
          } else {
            _this.callSuccess(contents);
          }
          server.ready();
        });
      }
    }
  };

  Request.prototype._handleFileCallback = function (err, contents) {
    if (err) {
      this.callError(err);
    } else {
      this.callSuccess(contents);
    }
  };

  var blocksApplication = blocks.Application;

  blocks.Application = function (options) {
    var app = blocksApplication(options);
    app._router._setBaseUrl(window.__baseUrl__);
    server.data.baseUrl = window.__baseUrl__;
    return app;
  };

});