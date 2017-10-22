'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _require = require('./helpers'),
    verifyBody = _require.verifyBody,
    verifyEndpoint = _require.verifyEndpoint,
    verifyHeaders = _require.verifyHeaders,
    verifyParameters = _require.verifyParameters;

var request = require('request-promise');

var commonService = function () {
    function commonService(_ref) {
        var apiKey = _ref.apiKey,
            endpoint = _ref.endpoint;

        _classCallCheck(this, commonService);

        this.apiKey = apiKey;
        this.endpoint = endpoint;
    }

    commonService.prototype.getOperationIdFromUrl = function getOperationIdFromUrl(url) {
        var splittedUrl = url.split('/');
        return splittedUrl[splittedUrl.length - 1];
    };

    commonService.prototype.makeRequest = function makeRequest() {
        var _this = this;

        var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

        var operation = data.operation || {};
        operation.parameters = operation.parameters || [];
        var parameters = data.parameters || {};
        var headers = data.headers || {};
        var body = data.body || null;

        var contentTypeHeader = headers['Content-type'] || headers['Content-Type'] || "";

        return verifyBody(operation.parameters, body, contentTypeHeader).then(function (params) {
            operation.parameters = params;
            return verifyParameters(operation.parameters, parameters);
        }).then(function () {
            return verifyHeaders(operation.headers, headers);
        }).then(function () {
            return verifyEndpoint(_this.endpoints, _this.endpoint);
        }).then(function () {
            headers['Ocp-Apim-Subscription-Key'] = _this.apiKey;

            var path = operation.path;

            // mandatory route params
            operation.parameters.forEach(function (param) {
                if (parameters[param.name] && param.type == 'routeParam') {
                    path = path.split('{' + param.name + '}').join(parameters[param.name]);
                }
            });

            // query params
            var i = 0;
            operation.parameters.forEach(function (param) {
                if (parameters[param.name] && param.type == 'queryStringParam') {
                    if (i == 0) path += '?';else path += '&';
                    path += param.name + '="' + parameters[param.name] + '"';
                    i++;
                }
            });

            var host = operation.host || _this.endpoint;

            var uri = 'https://' + host + '/' + path;

            var options = {
                uri: uri,
                method: operation.method,
                headers: headers,
                qs: parameters,
                json: true // GET: Automatically parses the JSON string in the response, POST: Automatically stringifies the body to JSON
            };

            if (body != null) {
                options.body = body;
                if (contentTypeHeader && contentTypeHeader.indexOf('json') == -1) {
                    options.json = false; // do not stringify the request body to JSON
                }
                // POST: receive the response properly
                options.transform = function (body, res) {
                    var responseContentType = res.headers['content-type'];
                    if (responseContentType && responseContentType.indexOf('application/json') != -1) {
                        try {
                            return JSON.parse(body);
                        } catch (e) {
                            // do nothing. return the body as it is
                        }
                    }
                    if (res.headers['operation-location']) {
                        return res.headers['operation-location'];
                    }
                    return body;
                };
            }
            return request(options);
        });
    };

    return commonService;
}();

module.exports = commonService;