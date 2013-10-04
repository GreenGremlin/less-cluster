/**
Tests for the main class
**/
var assert = require('assert');
var vows = require('vows');
var path = require('path');

var EventEmitter = require('events').EventEmitter;
var LessCluster = require('../');

var suite = vows.describe('LessCluster');

suite.addBatch({
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
        "should have 'workers' default": function (topic) {
            assert.include(topic, 'workers');
        }
    }
});

suite.addBatch({
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
        },
        "should not override custom outputdir": function () {
            var options = LessCluster.checkArguments({
                outputdir: 'foo'
            });

            assert.strictEqual(options.outputdir, 'foo');
            assert.notStrictEqual(options.outputdir, options.directory);
        }
    }
});

var importsDir = __dirname + '/fixtures/imports/';

function addImportsDir(relativePath) {
    if (Array.isArray(relativePath)) {
        return relativePath.map(addImportsDir);
    }
    return path.join(importsDir, relativePath);
}

function removeImportsDir(relativePath) {
    if (Array.isArray(relativePath)) {
        return relativePath.map(removeImportsDir);
    }
    return relativePath.replace(importsDir, '');
}

suite.addBatch({
    "collect()": {
        topic: new LessCluster({
            "directory": importsDir
        }),

        "_getDestinationPath()": function (topic) {
            assert.strictEqual(
                topic._getDestinationPath(addImportsDir('base.less')),
                addImportsDir('base.css')
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
        "when executed": {
            topic: function (instance) {
                instance.collect(this.callback);
            },
            "does not error": function (err, data) {
                assert.ifError(err);
            },
            "provides data object": function (err, data) {
                assert.isObject(data);
            },
            "finds all files successfully": function (err, data) {
                assert.equal(Object.keys(data).length, 7);

                assert.include(data, addImportsDir("_variables.less"));
                assert.include(data, addImportsDir("base.less"));
                assert.include(data, addImportsDir("modules/child.less"));
                assert.include(data, addImportsDir("modules/parent.less"));
                assert.include(data, addImportsDir("modules/solo.less"));
                assert.include(data, addImportsDir("themes/fancy.less"));
                assert.include(data, addImportsDir("themes/simple.less"));
            }
        }
    }
});

function filterInstance(relativePaths) {
    var instanceConfig = {
        "directory": importsDir
    };

    if (relativePaths && relativePaths.length) {
        instanceConfig._files = relativePaths.map(function (p) {
            return path.join(importsDir, p);
        });
    }

    return function () {
        return new LessCluster(instanceConfig);
    };
}

function filesQueued(instance) {
    var test = this;

    instance.removeAllListeners("start").once("start", function (toProcess, toRead) {
        // context provides access to this._parents/_children in vows
        test.callback.call(instance, null, {
            "filesToProcess": toProcess,
            "filesToRead": toRead
        });
    });

    instance.collect();
}

function expectFiles(expected) {
    var ctx = {
        topic: function (queueArgs, instance) {
            // console.error("parents =", JSON.stringify(instance._parents, null, 4));
            // console.error("chillun =", JSON.stringify(instance._children, null, 4));
            return queueArgs[this.context.name];
        }
    };

    var testLengthName = expected.length
        ? "has " + expected.length + " item"
        : "has no items";
    if (expected.length > 1) {
        testLengthName += "s";
    }

    ctx[testLengthName] = function (topic) {
        // console.error(JSON.stringify(topic, null, 4));
        assert.equal(topic.length, expected.length);
    };

    ctx["matches all files"] = function (topic) {
        var absolutized = expected.map(addImportsDir);
        assert.deepEqual(topic, absolutized, "Unexpected:\n" +
            JSON.stringify(topic.map(removeImportsDir), null, 4)
        );
    };

    expected.forEach(function (relativePath, i) {
        ctx[relativePath] = function (topic) {
            assert.strictEqual(topic[i], addImportsDir(relativePath));
        };
    });

    return ctx;
}

function filtersOutput(config) {
    // http://vowsjs.org/#-macros

    var context = {
        "topic": filterInstance(config.toFilter),
        "queued": {
            "topic": filesQueued,
            "filesToProcess": expectFiles(config.toProcess),
            "filesToRead": expectFiles(config.toRead || config.toProcess)
        }
    };

    return context;
}

suite.addBatch({
    "Unfiltered": filtersOutput({
        "toProcess": [
            "_variables.less",
            "base.less",
            "modules/child.less",
            "modules/parent.less",
            "modules/solo.less",
            "themes/fancy.less",
            "themes/simple.less"
        ]
    }),
    "Filtering": {
        "[base.less]": filtersOutput({
            "toFilter" : ["base.less"],
            "toProcess": ["base.less"],
            "toRead"   : [
                "_variables.less",
                "base.less",
                "modules/child.less",
                "modules/parent.less",
                "themes/fancy.less",
                "themes/simple.less"
            ]
        }),
        "[modules/parent.less]": filtersOutput({
            "toFilter" : ["modules/parent.less"],
            "toProcess": ["modules/parent.less"],
            "toRead"   : [
                "_variables.less",
                "base.less",
                "modules/child.less",
                "modules/parent.less",
                "themes/fancy.less",
                "themes/simple.less"
            ]
        }),
        "[_variables.less]": filtersOutput({
            "toFilter" : ["_variables.less"],
            "toProcess": [
                "_variables.less"
                // "modules/child.less",
                // "modules/parent.less",
                // "themes/fancy.less"
            ],
            "toRead"   : [
                "_variables.less",
                // TODO: grandparents
                // "base.less",
                "modules/child.less",
                "modules/parent.less",
                "themes/fancy.less",
                "themes/simple.less"
            ]
        }),
        "[themes/simple.less]": filtersOutput({
            "toFilter" : ["themes/simple.less"],
            "toProcess": ["themes/simple.less"],
            "toRead"   : [
                "_variables.less",
                "modules/child.less",
                "themes/simple.less"
            ]
        }),
        "[modules/solo.less]": filtersOutput({
            "toFilter" : ["modules/solo.less"],
            "toProcess": ["modules/solo.less"],
            "toRead"   : ["modules/solo.less"]
        })
    }
});

suite["export"](module);
