/*global describe, it, before, beforeEach, after, afterEach, chai, should, sinon */
/**
Tests for the worker
**/
var fs = require('graceful-fs');
var path = require('path');
var less = require('less');
var LessWorker = require('../lib/less-worker');

describe('LessWorker', function () {
    /*jshint expr:true */

    describe("factory", function () {
        /*jshint newcap: false */
        var instance = LessWorker();

        it("should instantiate without 'new'", function () {
            instance.should.be.an.instanceof(LessWorker);
        });
    });

    describe("instance", function () {
        var instance = new LessWorker();

        it("should instantiate as constructor", function () {
            instance.should.be.an.instanceof(LessWorker);
        });

        it("should create private caches as empty objects", function () {
            instance.should.have.property('_fileData').that.deep.equals({});
            instance.should.have.property('_pathCache').that.deep.equals({});
            instance.should.have.property('_pathRebase').that.deep.equals({});
        });

        it("should default options when missing", function () {
            instance.options.should.deep.equal(LessWorker.defaults);
        });

        it("should override defaults when passed", function () {
            (new LessWorker({ 'lint': true })).options.should.have.property('lint').that.is.true;
        });

        describe("destroy()", function () {
            before(function () {
                sinon.spy(instance, "removeAllListeners");
                instance.destroy();
            });

            it("should nullify private caches", function () {
                instance.should.have.property('_fileData').that.is.null;
                instance.should.have.property('_pathCache').that.is.null;
                instance.should.have.property('_pathRebase').that.is.null;
            });

            it("should remove all listeners", function () {
                instance.removeAllListeners.should.have.been.calledOnce;
            });

            it("should restore original less.Parser.importer");
            // this is hard to assert that it actually happened...
        });
    });

    describe("method", function () {
        var fileName = "a.less";
        var filePath = path.resolve(__dirname, "fixtures/imports/included", fileName);
        var fileData = "foo"; // file is actually empty, but we never actually read it

        var childImportName = "modules/parent.less";
        var childImportPath = path.resolve(__dirname, "fixtures/imports", childImportName);
        var parentFilePath  = path.resolve(__dirname, "fixtures/imports/base.less");

        var ohNoesError = "oh noes!";

        beforeEach(function () {
            this.instance = new LessWorker();
        });
        afterEach(function () {
            this.instance.destroy();
            this.instance = null;
        });

        describe("start()", function () {
            var message = { "cmd": "start", "data": [filePath] };

            beforeEach(function () {
                sinon.stub(this.instance, "emit");
                sinon.stub(LessWorker, "readFiles");
            });
            afterEach(function () {
                LessWorker.readFiles.restore();
            });

            it("should read all the files specified in message data", function () {
                this.instance.start(message);
                LessWorker.readFiles.should.have.been.calledWith(message.data, sinon.match.func);
            });

            it("should emit error event when encountered", function () {
                LessWorker.readFiles.yields(ohNoesError);
                this.instance.start(message);
                this.instance.emit.should.have.been.calledWith("error", ohNoesError);
            });

            it("should emit ready event when successful", function () {
                var data = {};
                data[fileName] = fileData;
                LessWorker.readFiles.yields(null, data);
                this.instance.start(message);
                this.instance.emit.should.have.been.calledWith("ready");
                this.instance._fileData.should.eql(data);
            });
        });

        describe("doneWrote()", function () {
            beforeEach(function () {
                sinon.stub(this.instance, "emit");
                sinon.stub(this.instance, "log");
            });
            afterEach(function () {
                this.instance.emit.restore();
                this.instance.log.restore();
            });

            it("should emit an error if present", function () {
                this.instance.doneWrote(filePath, ohNoesError);
                this.instance.emit.should.have.been.calledWith("error", ohNoesError);
            });

            it("should emit drain when successful", function () {
                this.instance.doneWrote(filePath);
                this.instance.log.should.have.been.calledOnce;
                this.instance.emit.should.have.been.calledWith("drain", filePath);
            });
        });

        describe("inDir()", function () {
            beforeEach(function () {
                sinon.stub(this.instance, "emit");
                sinon.stub(this.instance, "doneWrote");
                sinon.stub(fs, "writeFile");
            });
            afterEach(function () {
                this.instance.emit.restore();
                this.instance.doneWrote.restore();
                fs.writeFile.restore();
            });

            it("should emit an error if present", function () {
                this.instance.inDir(filePath, fileData, ohNoesError);
                this.instance.emit.should.have.been.calledWith("error", ohNoesError);
                fs.writeFile.should.not.have.been.called;
            });

            it("should write data into filename", function () {
                fs.writeFile.yields();
                this.instance.inDir(filePath, fileData, null);
                this.instance.doneWrote.should.have.been.calledOnce;
                fs.writeFile.should.have.been.calledWith(filePath, fileData, "utf8", sinon.match.func);
            });
        });

        describe("writeOutput()", function () {
            beforeEach(function () {
                sinon.stub(this.instance, "emit");
                sinon.stub(this.instance, "warn");
                sinon.stub(this.instance, "inDir");
                // mkdirp calls fs.mkdir under the covers
                sinon.stub(fs, "mkdir");
            });
            afterEach(function () {
                this.instance.emit.restore();
                this.instance.warn.restore();
                this.instance.inDir.restore();
                fs.mkdir.restore();
            });

            it("should skip writing if data empty, draining immediately", function () {
                this.instance.writeOutput(filePath, "");
                this.instance.warn.should.have.been.calledOnce;
                this.instance.emit.should.have.been.calledWith("drain", filePath);
                this.instance.inDir.should.not.have.been.called;
                fs.mkdir.should.not.have.been.called;
            });

            it("should ensure directory exists before writing", function () {
                fs.mkdir.yields(null); // success
                this.instance.writeOutput(filePath, fileData);
                fs.mkdir.should.have.been.calledWith(path.dirname(filePath));
                this.instance.inDir.should.have.been.calledWith(filePath, fileData, null);
            });
        });

        describe("resolveChildPath()", function () {
            beforeEach(function () {
                sinon.stub(fs, "existsSync");
            });
            afterEach(function () {
                fs.existsSync.restore();
            });

            describe("when cache is hot", function () {
                beforeEach(function () {
                    this.instance._pathCache[fileName] = filePath;
                });

                it("should early return cached childPath", function () {
                    var result = this.instance.resolveChildPath(fileName, parentFilePath, []);
                    fs.existsSync.should.not.have.been.called;
                    result.should.equal(filePath);
                });
            });

            describe("when cache is cold", function () {
                // simulating --include-path arguments
                var envPaths = [path.dirname(filePath)];

                beforeEach(function () {
                    fs.existsSync.withArgs(filePath).returns(true);
                    fs.existsSync.withArgs(childImportPath).returns(true);
                });

                it("should cache a successful lookup", function () {
                    this.instance
                        .resolveChildPath(childImportName, parentFilePath, envPaths)
                            .should.equal(childImportPath);

                    fs.existsSync.should.have.been.calledOnce;

                    this.instance._pathCache.should.have.property(childImportName, childImportPath);
                });

                it("should loop over all include paths when locating child", function () {
                    this.instance
                        .resolveChildPath(fileName, parentFilePath, envPaths)
                            .should.equal(filePath);

                    fs.existsSync.should.have.been.calledTwice;
                });

                it("should indicate if the resolved path has been rebased", function () {
                    this.instance.resolveChildPath(childImportName, parentFilePath, envPaths);
                    this.instance.resolveChildPath(fileName,        parentFilePath, envPaths);

                    fs.existsSync.should.have.been.calledThrice;

                    this.instance._pathRebase.should.have.property(childImportName, false);
                    this.instance._pathRebase.should.have.property(fileName,         true);
                });

                it("should throw error when lookup fails?");
            });
        });

        describe("rebaseRootPath()", function () {
            describe("when staying inside parent directory", function () {
                it("should not rebase child rootpath");
            });

            describe("when traversing outside parent directory", function () {
                it("should rebase relative from destination path");
                it("should rebase relative from root file source path");
            });
        });

        describe("build()", function () {
            it("TODO");
        });
    });
});
