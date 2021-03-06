/*global describe, it, before, beforeEach, after, afterEach, chai, should, sinon */
/**
Tests for the worker
**/
var cluster = require('cluster');

var LessCluster = require('../');
var ClusterWorker = LessCluster.Worker;

describe("Cluster Worker", function () {
    /*jshint expr:true */

    describe("factory", function () {
        it("should instantiate without 'new'", function () {
            /*jshint newcap: false */
            var instance = ClusterWorker();
            instance.should.be.instanceof(ClusterWorker);
        });
    });
    describe("instance", function () {
        it("should instantiate as constructor", function () {
            var instance = new ClusterWorker();
            instance.should.be.instanceof(ClusterWorker);
        });

        it("should not overwrite log prefix", function () {
            var instance = new ClusterWorker();
            instance.should.have.property("_logPrefix", "worker");
        });

        describe("when cluster.isWorker", function () {
            before(function () {
                cluster.isWorker = true;
                cluster.worker = {
                    id: 1
                };
            });
            after(function () {
                cluster.isWorker = null;
                cluster.worker = null;
            });

            it("should set log prefix", function () {
                var instance = new ClusterWorker();
                instance.should.have.property("_logPrefix", "worker[1]");
            });
        });
    });

    describe("event handling", function () {
        var instance = new ClusterWorker();

        it("should listen to 'message' on process", function () {
            // workers listen to events on process
            process.listeners('message').should.have.length.above(0);
        });

        it("should pass lifecycle events through to sendMaster", function () {
            var consoleError = sinon.stub(console, "error");
            var sendMaster = sinon.stub(instance, "sendMaster");

            // 'emit' returns true if there were listeners
            instance.emit('drain').should.be.true;
            instance.emit('error').should.be.true;
            instance.emit('ready').should.be.true;

            sendMaster.should.have.been.calledThrice;
            consoleError.should.have.been.calledOnce; // from emit('error')

            sendMaster.restore();
            consoleError.restore();
        });

        describe("when destroyed", function () {
            before(function () {
                sinon.spy(process, "removeListener");
                instance.destroy();
            });
            after(function () {
                process.removeListener.restore();
            });

            it("should remove process.message listener", function () {
                process.removeListener.should.have.been.calledWith("message", sinon.match.func);
            });
        });
    });

    describe("methods", function () {
        describe("dispatchMessage()", function () {
            var instance = new ClusterWorker();

            it("should require message object", function () {
                should.Throw(function () {
                    instance.dispatchMessage();
                }, "Message must have command");
            });
            it("should require message object with 'cmd'", function () {
                should.Throw(function () {
                    instance.dispatchMessage({
                        foo: 'foo'
                    });
                }, "Message must have command");
            });
            it("should reject invalid commands", function () {
                should.Throw(function () {
                    instance.dispatchMessage({
                        cmd: 'missing'
                    });
                }, "Message command invalid");
            });
            it("should execute build command", function () {
                var build = sinon.spy(instance, "build");
                var _build = sinon.stub(instance, "_build");

                var msg = {
                    cmd: "build",
                    dest: "one.css",
                    file: "one.less"
                };

                instance.dispatchMessage(msg);

                build.should.have.been.calledWith(msg);
                build.restore();

                _build.should.have.been.calledWith(msg.file, msg.dest);
                _build.restore();
            });
            it("should execute start command", function () {
                var start = sinon.stub(instance, "start");
                var msg = {
                    cmd: "start"
                };

                instance.dispatchMessage(msg);

                start.should.have.been.calledWith(msg);
                start.restore();
            });
        });

        describe("sendMaster()", function () {
            before(function () {
                cluster.isWorker = true;
                cluster.worker = {
                    id: 1
                };
            });
            after(function () {
                cluster.isWorker = null;
                cluster.worker = null;
            });

            describe("when process disconnected", function () {
                it("should not error", function () {
                    var instance = new ClusterWorker();
                    /*jshint immed:false */
                    should.not.Throw(function () {
                        instance.sendMaster("foo");
                    });
                });
            });

            describe("when process connected", function () {
                beforeEach(function () {
                    process.connected = true;
                    process.send = sinon.stub();
                });
                afterEach(function () {
                    process.connected = null;
                    process.send = null;
                });

                it("should send message", function () {
                    var instance = new ClusterWorker();
                    instance.sendMaster("foo");
                    process.send.should.have.been.calledOnce;
                    process.send.should.have.been.calledWith({ evt: "foo", id: 1 });
                });
            });
        });

        describe("start()", function () {
            var message = { "cmd": "start", "data": ["foo.less"] };

            beforeEach(function () {
                this.instance = new ClusterWorker();
                sinon.stub(this.instance, "emit");
                sinon.stub(ClusterWorker, "readFiles");
            });
            afterEach(function () {
                ClusterWorker.readFiles.restore();
                this.instance.destroy();
                this.instance = null;
            });

            it("should read all the files specified in message data", function () {
                this.instance.start(message);
                ClusterWorker.readFiles.should.have.been.calledWith(message.data, sinon.match.func);
            });

            it("should emit error event when encountered", function () {
                var ohNoesError = "oh noes!";
                ClusterWorker.readFiles.yields(ohNoesError);
                this.instance.start(message);
                this.instance.emit.should.have.been.calledWith("error", ohNoesError);
            });

            it("should emit ready event when successful", function () {
                var data = {};
                data["foo.less"] = "foo";
                ClusterWorker.readFiles.yields(null, data);
                this.instance.start(message);
                this.instance.emit.should.have.been.calledWith("ready");
                this.instance._fileCache.should.eql(data);
            });
        });
    });
});
