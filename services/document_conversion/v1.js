/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var extend         = require('extend');
var requestFactory = require('../../lib/requestwrapper');
var isStream       = require('isstream');
var omit           = require('object.omit');

/**
 *
 * @param options
 * @constructor
 */
function DocumentConversion(options) {
  // Warn if not specifying version date
  var version_date = '2015-12-01';
  if(options && options.version_date) {
    version_date = options.version_date;
  } else {
    // eslint-disable-next-line no-console
    console.warn('[DocumentConversion] WARNING: No version_date specified. Using a (possibly old) default. ' +
                  'e.g. watson.document_conversion({ version_date: "2015-12-01" })');
  }

  // Default URL
  var serviceDefaults = {
    url: 'https://gateway.watsonplatform.net/document-conversion/api',
    qs: { version: version_date }
  };

  // Replace default options with user provided
  this._options = extend(serviceDefaults, options);
}


DocumentConversion.prototype.conversion_target = {
  ANSWER_UNITS: 'ANSWER_UNITS',
  NORMALIZED_HTML: 'NORMALIZED_HTML',
  NORMALIZED_TEXT: 'NORMALIZED_TEXT'
};

// this sets up the content type "headers" in the form/multipart body (not in the actual headers)
function fixupContentType(params) {
  if (params.content_type) {
    params.file = {
      value: params.file,
      options: {
        contentType: params.content_type
      }
    };
  }
  else if (params.file.path && /.html?$/.test(params.file.path)) {
    // for HTML, the service requires that a utf-8 charset be specified in the content-type
    params.file = {
      value: params.file,
      options: {
        contentType: 'text/html; charset=utf-8'
      }
    };
  }
}

/**
 * One-off convert an attached document OR convert a previously uploaded document by ID
 *
 * To convert a previously uploaded document, set params.document_id
 *
 * @param  {Object} params
 * @param  {Object} params.conversion_target Must be set to one of ['ANSWER_UNITS', 'NORMALIZED_HTML', 'NORMALIZED_TEXT']
 * @param  {ReadableStream} [params.file] The document file to convert. May be a ReadableStream or Buffer
 * @param  {String} [params.content_type] Set this when the content type cannot be determined from the filename (params.file.path)
 * @param  {Function} callback
 */
DocumentConversion.prototype.convert = function(params, callback) {
  params = params || {};
  if (!params.conversion_target || !DocumentConversion.prototype.conversion_target[params.conversion_target]) {
    var keys = Object.keys(DocumentConversion.prototype.conversion_target);
    var values = keys.map(function(v) { return DocumentConversion.prototype.conversion_target[v]; });

    callback(new Error('Missing required parameters: conversion_target. Possible values are: ' + values.join(', ')));
    return;
  }

  if (!params.file && !params.document_id) {
    callback(new Error('Missing required parameters: either params.file or params.document_id must be specified'));
    return;
  }

  if (params.file && !isStream(params.file) && !Buffer.isBuffer(params.file) && !params.file.value) {
    callback(new Error('Missing required parameters: file is not a standard Node.js Stream or Buffer'));
    return;
  }

  var parameters = {
    options: {
      method: 'POST',
      url: '/v1/convert_document',
      json: true
    },
    defaultOptions: this._options
  };

  // send the parameters in the body or as formData depending on the request
  if (params.file) {
    fixupContentType(params);
    parameters.options.formData = {
      file: params.file,
      config: {
        value: JSON.stringify(omit(params,['file', 'content_type'])),
        options: {
          contentType: 'application/json; charset=utf-8'
        }
      }
    };
  } else {
    parameters.options.body = params;
  }

  return requestFactory(parameters, callback);
};

/**
 * One-off convert and index a document via index_document API
 *
 * NOTE: A SOLR cluster and search collection will have to be created through the Retrieve and Rank
 *       service prior to using this API if actual indexing is performed (dry_run=false).
 *
 * @param  {Object} params
 * @param  {ReadableStream} [params.file] The document file to convert. May be a ReadableStream or Buffer
 * @param  {Object} params.metadata Metadata array of Object's where each object contains 'name' and 'value'
 * @param  {Object} params.config Configuration for the conversion and indexing. The conversion config needs
                      to be in a 'convert_document' object. This can include configuration for 'pdf', 'word'
                      and 'normalized_html' phases of the conversion process. The indexing config needs to be
                      in a 'retrieve_and_rank' object. The 'retrieve_and_rank' object has the following fields:
                      'dry_run' - boolean value, true if a dry run is to be performed, false to actually index,
                      'service_instance_id' - The serviceGuid of your instance of the retrieve and rank
                      service (required if dry_run=false), 'cluster_id' - The Solr cluster id for your retrieve
                      and rank service instance (required if dry_run=false), 'search_collection' - The name of
                      your Solr search collection from your retrieve and rank service instance (required if
                      dry_run=false), and 'fields' - Configuration information for field 'mappings', fields
                      to 'include', and fields to 'exclude' during indexing (exclude takes precedence over include)
 * @param  {Function} callback
 */
DocumentConversion.prototype.index = function(params, callback) {
  params = params || {};
  if (!params.file && !params.metadata) {
    callback(new Error('Missing required parameters: file or metadata. At least one of those is required.'));
    return;
  }
  if (params.file && !isStream(params.file) && !Buffer.isBuffer(params.file) && !params.file.value) {
    callback(new Error('Missing required parameters: file is not a standard Node.js Stream or Buffer'));
    return;
  }
  if (!params.config) {
    callback(new Error('Missing required parameters: file or metadata. At least one of those is required.'));
    return;
  }

  var parameters = {
    options: {
      method: 'POST',
      url: '/v1/index_document',
      json: true
    },
    defaultOptions: this._options
  };

  // send the parameters as formData
  if (params.file && params.metadata) {
    fixupContentType(params);
    parameters.options.formData = {
      file: params.file,
      config: {
        value: JSON.stringify(params.config),
        options: {
          contentType: 'application/json; charset=utf-8'
        }
      },
      metadata: {
        value: JSON.stringify(params.metadata),
        options: {
          contentType: 'application/json; charset=utf-8'
        }
      }
    };
  } else if (params.file) {
    fixupContentType(params);
    parameters.options.formData = {
      file: params.file,
      config: {
        value: JSON.stringify(params.config),
        options: {
          contentType: 'application/json; charset=utf-8'
        }
      }
    };
  } else if (params.metadata) {
    parameters.options.formData = {
      config: {
        value: JSON.stringify(params.config),
        options: {
          contentType: 'application/json; charset=utf-8'
        }
      },
      metadata: {
        value: JSON.stringify(params.metadata),
        options: {
          contentType: 'application/json; charset=utf-8'
        }
      }
    };
  } else {
    callback(new Error('Missing required parameters: file or metadata. At least one of those is required.'));
    return;
  }

  return requestFactory(parameters, callback);
};


// give a clear error message for the deprecated methods
['getOutput', 'getOutputs', 'getJobLog', 'getJobs', 'getJob', 'createJob', 'getBatchDocument', 'getBatchDocuments',
  'addDocumentToBatch', 'getDocument', 'getDocuments', 'uploadDocument', 'getBatchDocuments', 'updateBatch', 'getBatch', 'createBatch', 'getBatches'].forEach(function(name) {
    DocumentConversion.prototype[name] = function deprecated() {
      throw new Error('The DocumentConversion.' + name + '() method was deprecated and is no longer available, please use convert() instead.');
  };
});


module.exports = DocumentConversion;
