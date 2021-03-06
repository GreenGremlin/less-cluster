/*global describe, it, before, beforeEach, after, afterEach, chai, should, sinon */
/**
Tests for the main class
**/
var path = require('path');
var cluster = require('cluster');

var LessCluster = require('../');
var Master = LessCluster.Master;

describe("Cluster Master", function () {
    /*jshint expr:true */

    describe("Lifecycle", function () {
        describe("factory", function () {
            /*jshint newcap: false */
            var instance = Master();
            instance.removeAllListeners("run");

            it("should instantiate without 'new'", function () {
                instance.should.be.instanceof(Master);
            });
        });

        describe("instance", function () {
            var instance = new Master();
            instance.removeAllListeners("run");

            it("should instantiate safely with no config", function () {
                instance.should.be.instanceof(Master);
            });
            it("should inherit LessCluster", function () {
                instance.should.be.instanceof(LessCluster);
            });
        });
    });

    describe("Method", function () {
        beforeEach(function () {
            this.instance = new Master();
            this.instance.removeAllListeners("run");
        });
        afterEach(function () {
            this.instance = null;
        });

        describe("destroy()", function () {
            it("should emit 'cleanup'", function (done) {
                this.instance.once("cleanup", done);
                this.instance.destroy();
            });

            it("should exit with error code when provided", function () {
                sinon.stub(process, "exit");

                this.instance.destroy(1);

                process.exit.should.have.been.calledWithExactly(1);
                process.exit.restore();
            });
        });

        describe("setupMaster()", function () {
            beforeEach(function () {
                sinon.stub(cluster, "once");
                sinon.stub(cluster, "setupMaster");
            });
            afterEach(function () {
                cluster.once.restore();
                cluster.setupMaster.restore();
            });

            it("should hook cluster 'setup' event", function () {
                this.instance.setupMaster();

                cluster.once.should.have.been.calledWith("setup", sinon.match.func);
            });

            it("should pass options to cluster.setupMaster", function () {
                var options = { exec: "worker.js" };

                this.instance.setupMaster(options);

                cluster.setupMaster.should.have.been.calledWith(options);
            });
        });

        describe("forkWorkers()", function () {
            beforeEach(function () {
                sinon.stub(cluster, "fork");
                this.instance.options.workers = 1;
            });
            afterEach(function () {
                cluster.fork.restore();
            });

            it("should fork configured number of workers", function () {
                this.instance.forkWorkers();
                cluster.fork.should.have.been.calledOnce;
            });

            it("should execute provided callback", function (done) {
                this.instance.forkWorkers(done);
            });
        });

        describe("run()", function () {
            beforeEach(function () {
                sinon.stub(this.instance, "setupMaster");
                sinon.stub(this.instance, "forkWorkers");
            });
            afterEach(function () {
                this.instance.emit("cleanup");
            });

            it("should not proceed when cluster.isMaster == false", function () {
                cluster.isMaster = false;
                this.instance.run();
                cluster.isMaster = true;

                this.instance.setupMaster.should.not.have.been.called;
                this.instance.forkWorkers.should.not.have.been.called;
            });

            it("should call setupMaster() with exec path", function () {
                this.instance.run();

                this.instance.setupMaster.should.have.been.calledOnce;
                this.instance.setupMaster.should.have.been.calledWith({
                    exec: path.resolve(__dirname, '../lib/worker.js')
                });
            });

            it("should bind collect() as forkWorkers callback", function () {
                sinon.stub(this.instance, "collect");

                this.instance.forkWorkers.yields();
                this.instance.run();

                this.instance.collect.should.have.been.calledOnce;
            });
        });

        describe("runQueue()", function () {
            beforeEach(function () {
                cluster.workers = {
                    "1": {},
                    "2": {}
                };
            });
            afterEach(function () {
                cluster.workers = {};
            });

            it("should enqueue all workers", function () {
                sinon.stub(this.instance, "getNextFile").returns(undefined);
                this.instance.should.not.have.property("running");

                this.instance.runQueue();

                this.instance.should.have.property("running", 0);
                this.instance.getNextFile.should.have.been.calledTwice;
            });

            it("should not error if no files available to build", function () {
                var instance = this.instance;
                instance.filesToProcess = [];
                should.not.Throw(function () {
                    instance.runQueue();
                });
            });

            it("should cause all workers to build a file, if available", function () {
                this.instance.filesToProcess = ["foo", "bar", "baz"];
                sinon.stub(this.instance, "buildFile");

                this.instance.runQueue();

                this.instance.should.have.property("running", 2);
                this.instance.buildFile.should.have.been.calledTwice;
                this.instance.buildFile.should.have.been.calledWith("foo", "1");
                this.instance.buildFile.should.have.been.calledWith("bar", "2");
            });
        });

        describe("sendWorkers()", function () {
            it("should send payload to each worker", function () {
                var payload = { foo: "foo" };
                cluster.workers = {
                    "1": { send: sinon.stub() },
                    "2": { send: sinon.stub() }
                };

                this.instance.sendWorkers(payload);

                cluster.workers["1"].send.should.have.been.calledOnce.and.calledWith(payload);
                cluster.workers["2"].send.should.have.been.calledOnce.and.calledWith(payload);

                cluster.workers = {};
            });
        });

        describe("startQueue()", function () {
            var filesToProcess = ["foo", "bar"];
            var filesToRead = ["alpha", "beta", "gamma"];

            beforeEach(function () {
                sinon.stub(this.instance, "sendWorkers");
                cluster.workers = {
                    "1": {},
                    "2": {}
                };
            });
            afterEach(function () {
                cluster.workers = null;
            });

            it("should send commands to workers immediately when not running", function () {
                this.instance.startQueue(filesToProcess, filesToRead);
                this.instance.sendWorkers.should.have.been.calledOnce;
            });

            it("should wait until finished to send commands to workers, if already running", function () {
                sinon.stub(this.instance, "once");
                this.instance.running = 1;
                this.instance.startQueue(filesToProcess, filesToRead);
                this.instance.once.should.have.been.calledOnce;
                this.instance.once.should.have.been.calledWith("finished", sinon.match.func);
            });

            it("should initialize filesToProcess and readied instance properties", function () {
                this.instance.startQueue(filesToProcess, filesToRead);
                this.instance.should.have.property("filesToProcess", filesToProcess);
                this.instance.should.have.property("readied", 0);
            });

            it("should pass filesToRead in worker 'start' data, if available", function () {
                this.instance.startQueue(filesToProcess, filesToRead);
                this.instance.sendWorkers.should.have.been.calledWith({
                    cmd: "start",
                    data: filesToRead
                });
            });

            it("should pass filesToProcess in worker 'start' data when filesToRead missing", function () {
                this.instance.startQueue(filesToProcess);
                this.instance.sendWorkers.should.have.been.calledWith({
                    cmd: "start",
                    data: filesToProcess
                });
            });
        });

        describe("buildFile()", function () {
            beforeEach(function () {
                cluster.workers = {
                    "1": { send: sinon.stub() },
                    "2": { send: sinon.stub() }
                };
            });
            afterEach(function () {
                cluster.workers = {};
            });

            it("should not send message when worker missing", function () {
                this.instance.buildFile("missing_worker", 3);

                cluster.workers["1"].send.should.not.have.been.called;
                cluster.workers["2"].send.should.not.have.been.called;
            });

            it("should not send message when fileName missing", function () {
                this.instance.buildFile(null, 2);

                cluster.workers["2"].send.should.not.have.been.called;
            });

            it("should send 'build' message to designated worker", function () {
                this.instance.buildFile("one.less", 1);

                cluster.workers["1"].send.should.have.been.calledOnce;
                cluster.workers["1"].send.should.have.been.calledWith({
                    cmd: "build",
                    dest: path.resolve("one.css"),
                    file: "one.less"
                });
            });
        });
    });

    describe("Events", function () {
        beforeEach(function () {
            this.instance = new Master();
            this.instance.removeAllListeners("run");

            sinon.stub(this.instance, "forkWorkers");

            // spy instance methods to allow execution
            sinon.spy(this.instance, "on");
            sinon.spy(this.instance, "removeAllListeners");

            sinon.stub(cluster, "on");
            sinon.stub(process, "on");

            sinon.stub(cluster, "removeListener");
            sinon.stub(process, "removeListener");

            sinon.stub(cluster, "setupMaster");
            sinon.stub(cluster, "once").yields();
            // calls the "setup" handler immediately
        });
        afterEach(function () {
            cluster.setupMaster.restore();
            cluster.once.restore();

            cluster.on.restore();
            process.on.restore();

            cluster.removeListener.restore();
            process.removeListener.restore();

            this.instance = null;
        });

        it("should bind after setup", function () {
            this.instance.run();

            cluster.on.callCount.should.equal(4);
            cluster.on.should.be.calledWith("fork",       sinon.match.func);
            cluster.on.should.be.calledWith("online",     sinon.match.func);
            cluster.on.should.be.calledWith("disconnect", sinon.match.func);
            cluster.on.should.be.calledWith("exit",       sinon.match.func);

            process.on.callCount.should.equal(2);
            process.on.should.be.calledWith("SIGINT",  sinon.match.func);
            process.on.should.be.calledWith("SIGTERM", sinon.match.func);

            // "this.on" count (3) includes "this.once" count (3)
            this.instance.on.callCount.should.equal(6);
            this.instance.on.should.be.calledWith("drain",    sinon.match.func);
            this.instance.on.should.be.calledWith("empty",    sinon.match.func);
            this.instance.on.should.be.calledWith("finished", sinon.match.func);
        });

        it("should unbind after cleanup", function () {
            this.instance.run();
            this.instance.emit("cleanup");

            cluster.removeListener.callCount.should.equal(4);
            cluster.removeListener.should.be.calledWith("fork",       sinon.match.func);
            cluster.removeListener.should.be.calledWith("online",     sinon.match.func);
            cluster.removeListener.should.be.calledWith("disconnect", sinon.match.func);
            cluster.removeListener.should.be.calledWith("exit",       sinon.match.func);

            process.removeListener.callCount.should.equal(2);
            process.removeListener.should.be.calledWith("SIGINT",  sinon.match.func);
            process.removeListener.should.be.calledWith("SIGTERM", sinon.match.func);

            this.instance.removeAllListeners.callCount.should.equal(3);
            this.instance.removeAllListeners.should.be.calledWith("drain");
            this.instance.removeAllListeners.should.be.calledWith("empty");
            this.instance.removeAllListeners.should.be.calledWith("finished");
        });
    });

    describe("Handler", function () {
        beforeEach(function () {
            this.instance = new Master();
            this.instance.removeAllListeners("run");

            sinon.stub(this.instance, "debug");
        });
        afterEach(function () {
            this.instance.destroy();
            this.instance = null;
        });

        describe("for cluster event", function () {
            beforeEach(function () {
                this.instance._bindCluster();
                this.worker = {
                    on: sinon.stub(),
                    id: 1
                };
            });
            afterEach(function () {
                this.worker = null;
            });

            describe("'fork'", function () {
                it("should log activity", function () {
                    cluster.emit("fork", this.worker);
                    this.instance.debug.should.be.calledWith("worker[1] forked.");
                });
            });

            describe("'online'", function () {
                it("should log activity", function () {
                    cluster.emit("online", this.worker);
                    this.instance.debug.should.be.calledWith("worker[1] online.");
                });

                it("should bind worker 'message' event", function () {
                    cluster.emit("online", this.worker);
                    this.worker.on.should.be.calledWith("message", sinon.match.func);
                });
            });

            describe("'disconnect'", function () {
                it("should log activity", function () {
                    cluster.emit("disconnect", this.worker);
                    this.instance.debug.should.be.calledWith("worker[1] disconnected.");
                });
            });

            describe("'exit'", function () {
                beforeEach(function () {
                    sinon.stub(cluster, "fork");
                });
                afterEach(function () {
                    cluster.fork.restore();
                });

                it("should log activity", function () {
                    this.worker.suicide = true;
                    cluster.emit("exit", this.worker);
                    this.instance.debug.should.be.calledWith("worker[1] exited.");
                });

                it("should not fork another worker when exit was a suicide", function () {
                    this.worker.suicide = true;
                    cluster.emit("exit", this.worker);
                    cluster.fork.should.not.be.called;
                });

                it("should fork another worker when exit was unexpected", function () {
                    sinon.stub(this.instance, "warn");
                    this.worker.suicide = false;
                    cluster.emit("exit", this.worker);
                    cluster.fork.should.be.calledOnce;
                    this.instance.warn.should.be.calledOnce;
                });
            });
        });

        describe("for process event", function () {
            // mocha does fancy stuff on SIGINT now,
            // so remove it before and restore after
            var mochaSigInt;
            before(function () {
                var listeners = process.listeners("SIGINT");
                if (listeners.length) {
                    mochaSigInt = listeners.shift();
                    process.removeListener("SIGINT", mochaSigInt);
                }
            });
            after(function () {
                if (mochaSigInt) {
                    process.on("SIGINT", mochaSigInt);
                }
            });

            beforeEach(function () {
                sinon.stub(cluster, "disconnect");
                this.instance._bindProcess();
            });
            afterEach(function () {
                cluster.disconnect.restore();
            });

            describe("'SIGINT'", function () {
                it("should call cluster.disconnect", function () {
                    process.emit("SIGINT");
                    cluster.disconnect.should.be.calledOnce;
                });
            });

            describe("'SIGTERM'", function () {
                it("should call cluster.disconnect", function () {
                    process.emit("SIGTERM");
                    cluster.disconnect.should.be.calledOnce;
                });
            });
        });

        describe("for instance event", function () {
            beforeEach(function () {
                this.instance._bindWorkers();
            });

            describe("'drain'", function () {
                beforeEach(function () {
                    this.instance.removeAllListeners("empty");
                    sinon.stub(this.instance, "getNextFile");
                });

                describe("with files remaining", function () {
                    it("should call buildFile() with appropriate arguments", function () {
                        this.instance.getNextFile.returns("foo.less");
                        sinon.stub(this.instance, "buildFile");
                        this.instance.emit("drain", 1);
                        this.instance.buildFile.should.be.calledWith("foo.less", 1);
                    });
                });

                describe("with no files remaining", function () {
                    it("should emit 'empty' event", function () {
                        this.instance.getNextFile.returns(undefined);
                        sinon.spy(this.instance, "emit");
                        this.instance.emit("drain", 1);
                        this.instance.emit.should.be.calledWith("empty", 1);
                    });
                });
            });

            describe("'empty'", function () {
                beforeEach(function () {
                    this.instance.removeAllListeners("finished");
                    sinon.spy(this.instance, "emit");
                });

                describe("with running workers remaining", function () {
                    it("should not emit 'finished' event", function () {
                        this.instance.running = 4;
                        this.instance.emit("empty", 1);
                        this.instance.emit.should.not.be.calledWith("finished");
                    });
                });

                describe("with no running workers remaining", function () {
                    it("should emit 'finished' event", function () {
                        this.instance.running = 1;
                        this.instance.emit("empty", 1);
                        this.instance.emit.should.be.calledWith("finished");
                    });
                });
            });

            describe("'finished'", function () {
                it("should call cluster.disconnect", function () {
                    sinon.stub(cluster, "disconnect");
                    this.instance.emit("finished");
                    cluster.disconnect.should.be.calledOnce;
                    cluster.disconnect.restore();
                });
            });
        });

        describe("for message event", function () {
            describe("with malformed message", function () {
                it("should log an error when 'evt' property missing", function () {
                    sinon.stub(this.instance, "error");
                    var badMessage = { foo: "foo" };
                    this.instance.onMessage(badMessage);
                    this.instance.error.should.be.calledWith(badMessage);
                });
            });

            describe("'ready'", function () {
                beforeEach(function () {
                    this.instance.readied = 0;
                });

                it("should track worker readiness", function () {
                    this.instance.onMessage({ evt: "ready" });
                    this.instance.readied.should.equal(1);
                });

                it("should run queue when all workers are ready", function () {
                    sinon.stub(this.instance, "runQueue");
                    this.instance.options.workers = 1;
                    this.instance.onMessage({ evt: "ready" });
                    this.instance.runQueue.should.be.calledOnce;
                });
            });

            describe("'drain'", function () {
                it("should emit 'drain' on instance", function () {
                    sinon.stub(this.instance, "emit");
                    this.instance.onMessage({ evt: "drain", id: 1 });
                    this.instance.emit.should.be.calledWith("drain", 1);
                });
            });

            describe("'error'", function () {
                it("should call process.exit with error code 1", function () {
                    sinon.stub(process, "exit");
                    sinon.stub(cluster, "disconnect").yields();

                    this.instance.onMessage({ evt: "error" });

                    process.exit.should.be.calledWith(1);
                    process.exit.restore();
                    cluster.disconnect.restore();
                });
            });
        });
    });
});
