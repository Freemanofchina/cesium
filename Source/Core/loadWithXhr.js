/*global define*/
define([
        '../ThirdParty/bluebird',
        './defaultValue',
        './defined',
        './DeveloperError',
        './RequestErrorEvent',
        './RuntimeError'
    ], function(
        Promise,
        defaultValue,
        defined,
        DeveloperError,
        RequestErrorEvent,
        RuntimeError) {
    'use strict';

    /**
     * Asynchronously loads the given URL.  Returns a promise that will resolve to
     * the result once loaded, or reject if the URL failed to load.  The data is loaded
     * using XMLHttpRequest, which means that in order to make requests to another origin,
     * the server must have Cross-Origin Resource Sharing (CORS) headers enabled.
     *
     * @exports loadWithXhr
     *
     * @param {Object} options Object with the following properties:
     * @param {String|Promise.<String>} options.url The URL of the data, or a promise for the URL.
     * @param {String} [options.responseType] The type of response.  This controls the type of item returned.
     * @param {String} [options.method='GET'] The HTTP method to use.
     * @param {String} [options.data] The data to send with the request, if any.
     * @param {Object} [options.headers] HTTP headers to send with the request, if any.
     * @param {String} [options.overrideMimeType] Overrides the MIME type returned by the server.
     * @returns {Promise.<Object>} a promise that will resolve to the requested data when loaded.
     *
     *
     * @example
     * // Load a single URL asynchronously. In real code, you should use loadBlob instead.
     * Cesium.loadWithXhr({
     *     url : 'some/url',
     *     responseType : 'blob'
     * }).then(function(blob) {
     *     // use the data
     * }).catch(function(error) {
     *     // an error occurred
     * });
     * 
     * @see loadArrayBuffer
     * @see loadBlob
     * @see loadJson
     * @see loadText
     * @see {@link http://www.w3.org/TR/cors/|Cross-Origin Resource Sharing}
     * @see {@link http://wiki.commonjs.org/wiki/Promises/A|CommonJS Promises/A}
     */
    function loadWithXhr(options) {
        options = defaultValue(options, defaultValue.EMPTY_OBJECT);

        //>>includeStart('debug', pragmas.debug);
        if (!defined(options.url)) {
            throw new DeveloperError('options.url is required.');
        }
        //>>includeEnd('debug');

        var responseType = options.responseType;
        var method = defaultValue(options.method, 'GET');
        var data = options.data;
        var headers = options.headers;
        var overrideMimeType = options.overrideMimeType;

        function load(url) {
            return loadWithXhr.load(url, responseType, method, data, headers, undefined, overrideMimeType);
        }

        if (typeof options.url.then === 'function') {
            return options.url.then(load);
        }

        return load(options.url);
    }

    var dataUriRegex = /^data:(.*?)(;base64)?,(.*)$/;

    function decodeDataUriText(isBase64, data) {
        var result = decodeURIComponent(data);
        if (isBase64) {
            return atob(result);
        }
        return result;
    }

    function decodeDataUriArrayBuffer(isBase64, data) {
        var byteString = decodeDataUriText(isBase64, data);
        var buffer = new ArrayBuffer(byteString.length);
        var view = new Uint8Array(buffer);
        for (var i = 0; i < byteString.length; i++) {
            view[i] = byteString.charCodeAt(i);
        }
        return buffer;
    }

    function decodeDataUri(dataUriRegexResult, responseType) {
        responseType = defaultValue(responseType, '');
        var mimeType = dataUriRegexResult[1];
        var isBase64 = !!dataUriRegexResult[2];
        var data = dataUriRegexResult[3];

        switch (responseType) {
        case '':
        case 'text':
            return decodeDataUriText(isBase64, data);
        case 'arraybuffer':
            return decodeDataUriArrayBuffer(isBase64, data);
        case 'blob':
            var buffer = decodeDataUriArrayBuffer(isBase64, data);
            return new Blob([buffer], {
                type : mimeType
            });
        case 'document':
            var parser = new DOMParser();
            return parser.parseFromString(decodeDataUriText(isBase64, data), mimeType);
        case 'json':
            return JSON.parse(decodeDataUriText(isBase64, data));
        default:
            throw new DeveloperError('Unhandled responseType: ' + responseType);
        }
    }

    // This is broken out into a separate function so that it can be mocked for testing purposes.
    loadWithXhr.load = function(url, responseType, method, data, headers, deferred, overrideMimeType) {
        return new Promise(function(resolve, reject) {
            var dataUriRegexResult = dataUriRegex.exec(url);
            if (dataUriRegexResult !== null) {
                resolve(decodeDataUri(dataUriRegexResult, responseType));
                return;
            }

            var xhr = new XMLHttpRequest();

            if (defined(overrideMimeType) && defined(xhr.overrideMimeType)) {
                xhr.overrideMimeType(overrideMimeType);
            }

            xhr.open(method, url, true);

            if (defined(headers)) {
                for (var key in headers) {
                    if (headers.hasOwnProperty(key)) {
                        xhr.setRequestHeader(key, headers[key]);
                    }
                }
            }

            if (defined(responseType)) {
                xhr.responseType = responseType;
            }

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    if (defined(xhr.response)) {
                        resolve(xhr.response);
                    } else {
                        // busted old browsers.
                        if (defined(xhr.responseXML) && xhr.responseXML.hasChildNodes()) {
                            resolve(xhr.responseXML);
                        } else if (defined(xhr.responseText)) {
                            resolve(xhr.responseText);
                        } else {
                            reject(new RuntimeError('unknown XMLHttpRequest response type.'));
                        }
                    }
                } else {
                    reject(new RequestErrorEvent(xhr.status, xhr.response, xhr.getAllResponseHeaders()));
                }
            };

            xhr.onerror = function(e) {
                reject(new RequestErrorEvent());
            };

            xhr.send(data);
        });
    };

    loadWithXhr.defaultLoad = loadWithXhr.load;

    return loadWithXhr;
});
