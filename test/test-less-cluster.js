/**
Tests for the main class
**/
var assert = require('assert');
var vows = require('vows');
var path = require('path');

var EventEmitter = require('events').EventEmitter;
var LessCluster = require('../lib/less-cluster');

vows.describe('Master').addBatch({
    "static defaults": {
        topic: function () {
            return LessCluster.defaults;
        },
        "should be an object": function (topic) {
            assert.isObject(topic);
        },
        "should have 'directory' default": function (topic) {
            assert.include(topic, 'directory');
        },
        "should have 'match' default": function (topic) {
            assert.include(topic, 'match');
        },
        "should have 'ignores' default": function (topic) {
            assert.include(topic, 'ignores');
        },
        "should have 'workers' default": function (topic) {
            assert.include(topic, 'workers');
        }
    },
    "factory": {
        topic: function () {
            /*jshint newcap: false */
            return LessCluster();
        },
        "should instantiate without 'new'": function (topic) {
            assert.ok(topic instanceof LessCluster);
        }
    },
    "instance": {
        topic: function () {
            return new LessCluster();
        },
        "should instantiate safely with no config": function (topic) {
            assert.ok(topic instanceof LessCluster);
        },
        "should inherit EventEmitter": function (topic) {
            assert.ok(LessCluster.super_ === EventEmitter);
            assert.ok(topic instanceof EventEmitter);
        },
        "should default all options": function (topic) {
            assert.ok(topic.hasOwnProperty('options'));

            assert.strictEqual(topic.options.match, '**/*.less');
            assert.strictEqual(topic.options.workers, require('os').cpus().length);
        },
        "should setup private caches": function (topic) {
            assert.ok(topic.hasOwnProperty('_parents'));
            assert.ok(topic.hasOwnProperty('_children'));
            assert.ok(topic.hasOwnProperty('_fileData'));

            assert.deepEqual(topic._parents, {});
            assert.deepEqual(topic._children, {});
            assert.deepEqual(topic._fileData, {});
        },
        "destroy()": {
            topic: function () {
                var instance = new LessCluster();

                instance._detachEvents = function () {
                    this.callback(true);
                };

                instance.destroy();
            },
            "should call _detachEvents": function (topic) {
                assert.ok(topic);
            }
        }
    },

    "checkArguments": {
        "should allow missing config parameter": function () {
            assert.doesNotThrow(function () {
                var options = LessCluster.checkArguments();
                assert.ok("object" === typeof options);
            });
        },
        "should default options.directory to CWD": function () {
            var options = LessCluster.checkArguments({});

            assert.strictEqual(options.directory, process.cwd());
        },
        "should default options.outputdir to options.directory": function () {
            var options = LessCluster.checkArguments({});

            assert.strictEqual(options.outputdir, options.directory);
        }
    },

    "forkWorkers()": {
        topic: function () {
            var instance = new LessCluster({
                workers: 0
            });

            instance.forkWorkers(this.callback);
        },
        "should execute provided callback": function (err) {
            assert.ifError(err);
        }
    },

    "run()": {
        "should call collect() without arguments": function () {
            var instance = new LessCluster({ workers: 0 });

            instance.setupMaster = function () {};
            instance.collect = function () {
                assert.strictEqual(arguments.length, 0);
            };

            instance.run();
        },
        "should call setupMaster() with exec path": function () {
            var instance = new LessCluster({ workers: 0 });

            instance.setupMaster = function (options) {
                assert.deepEqual(options, {
                    exec: path.resolve(__dirname, '../lib/less-worker.js')
                });
            };
            instance.collect = function () {};

            instance.run();
        },
        "_attachEvents() should fire after cluster.setupMaster()": function () {
            var instance = new LessCluster({ workers: 0 });

            instance._attachEvents = function () {
                assert.ok(true);
            };

            instance.setupMaster();
        }
    },

    "collect()": {
        topic: function () {
            return new LessCluster();
        },

        "_getDestinationPath()": function (topic) {
            assert.strictEqual(
                topic._getDestinationPath(__dirname + '/fixtures/file-reader/a.less'),
                __dirname + '/fixtures/file-reader/a.css'
            );
        },

        "_getRelativePath()": function (topic) {
            assert.strictEqual(topic._getRelativePath(__dirname + '/fixtures'), 'test/fixtures');
        },
        "_getGlobPattern()": function (topic) {
            assert.strictEqual(topic._getGlobPattern('foo'), 'foo/' + topic.options.match);
        },
        "_getLessExtension()": function (topic) {
            assert.strictEqual(topic._getLessExtension('foo/bar.less'), 'foo/bar.less');
            assert.strictEqual(topic._getLessExtension('baz/qux'), 'baz/qux.less');
        },
        "_filterCSSImports()": function (topic) {
            assert.strictEqual(topic._filterCSSImports('foo/bar.less'), true);
            assert.strictEqual(topic._filterCSSImports('baz/qux.css'), false);
        },
        "_parseImports()": function () {
            // console.error("TODO");
        },
        "_finishCollect()": function () {
            // console.error("TODO");
        },
        "collect()": function () {
            // console.error("TODO");
        }
    }
})["export"](module);
