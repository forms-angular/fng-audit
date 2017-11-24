import * as chai from "chai";

import * as mongoose from 'mongoose';

let fngAudit = require("../fng-audit");

let assert = chai.assert;

mongoose.connect("mongodb://localhost:27017/fng_audit_test", {useMongoClient: true});
(<any>mongoose).Promise = global.Promise;
// mongoose.set('debug', true);

let testSchema = new mongoose.Schema(
    {
        aString: {type: String},
        aNumber: {type: Number},
        aBoolean: {type: Boolean},
        aDate: {type: Date},
        strings: {type: [String]},
        subObject: {
            attrib: Number
        }
    });

testSchema.plugin(fngAudit.plugin);

let Test: any;
try {
    Test = mongoose.model("test");
} catch (e) {
    Test = mongoose.model("test", testSchema);
}

describe('Object cleaning', function () {

    it('returns a simple populated object', function () {
        let obj = {a: 1, b: 'two'};
        assert.deepEqual(obj, fngAudit.clean(obj))
    });

    it('returns a nested object', function () {
        let obj = {a: 1, b: 'two', c: {c1: 1, c2: 'two'}};
        assert.deepEqual(obj, fngAudit.clean(obj))
    });

    it('strips out an empty array', function () {
        let obj: any = {a: 1, b: 'two', c: []};
        let obj2 = fngAudit.clean(obj);
        assert.equal(obj.a, obj2.a);
        assert.equal(obj.b, obj2.b);
        assert.isUndefined(obj2.c);
    });

    it('handles an array of strings', function () {
        let obj = {a: 1, b: 'two', c: ['abb', 'ssss']};
        assert.deepEqual(obj, fngAudit.clean(obj))
    });

    it('handles an array of populated objects', function () {
        let obj = {a: 1, b: 'two', c: [{a: 'abb'}, {a: 'ssss'}]};
        assert.deepEqual(obj, fngAudit.clean(obj))
    });

    it('strips empty arrays from an array of populated objects', function () {
        let obj: any = {a: 1, b: 'two', c: [{a: 'abb', b: []}, {a: 'ssss', b: ['asds']}]};
        let obj2 = fngAudit.clean(obj);
        assert.isUndefined(obj2.c[0].b);
    });

    it('strips empty objects that only contained empty arrays', function () {
        let obj: any = {a: 1, b: 'two', loseMe: {b: [], c: []}};
        let obj2 = fngAudit.clean(obj);
        assert.isUndefined(obj2.loseMe);
    });

});

describe('Mongoose Plugin', function () {

    let handledErr: string;

    before('set up the audit plugin', function () {
        fngAudit.controller({
            mongoose: mongoose,
            app: {
                get: function () {
                }
            },
            getResourceFromCollection: function() {
                return {
                    resourceName: 'test',
                    model: Test,
                    options: {}
                }
            },
            extractTimestampFromMongoID: function (id: any) {
                let timestamp = id.toString().substring(0, 8);
                return new Date(parseInt(timestamp, 16) * 1000);
            }
        }, null,{errorHandler: function(err: string) {
                handledErr = err.toString();
            }
        });
    });

    beforeEach('clear down the test database', function (done) {
        Promise.all([
            Test.remove({}),
            fngAudit.Audit.remove({})
        ])
            .then(() => {
                done()
            });
    });

    describe('Error handling', function() {

        it ('calls an error handler', function(done) {
            Test.create([{aString: 'Original'}], function (err: any, test: mongoose.Document[]) {
                if (err) {
                    throw err
                }
                Test.findByIdAndUpdate(test[0]._id, {$rename:{aString:'NewVal'}}, function (err: any) {
                    if (err) {throw err}
                    assert.equal(handledErr, 'No audit trail support for $rename');
                    done();
                })
            });
        });
    });

    describe('save', function () {

        let orig: any, modified: any;

        beforeEach(function (done) {
            orig = {aString: 'Original', aNumber: 1};
            Test.create([orig], function (err: any, test: mongoose.Document[]) {
                if (err) {
                    throw err
                }
                orig = test[0].toObject();
                test[0].set({aString: 'Update', aNumber: 2, aBoolean: true});
                test[0].save(function (err, test2: mongoose.Document) {
                    if (err) {
                        throw err
                    }
                    modified = test2.toObject();
                    done();
                })
            });
        });

        it('creates an audit record', function (done) {
            fngAudit.Audit.count({}, function (err: any, count: number) {
                assert.isNull(err);
                assert.equal(count, 1);
                done();
            });
        });

        it('records changes in audit record', function (done) {
            fngAudit.Audit.find({c: 'test', cId: orig._id}, function (err: any, auditRecs: Array<any>) {
                assert.equal(auditRecs.length, 1);
                assert.exists(auditRecs[0].chg);
                done();
            });
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(obj.toObject(), orig);
                done();
            })
        });

        it('returns history', function(done) {
            fngAudit.getAuditTrail('test', orig._id.toString(), function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(obj[0].comment, 'modified aBoolean, aNumber, aString');
                done();
            })
        })

    });

    describe('findOneAndUpdate', function () {

        let orig: any;

        beforeEach(function (done) {
            orig = {aString: 'Original', aNumber: 1, subObject:{attrib: 1}};
            Test.create([orig], function (err: any, test: mongoose.Document[]) {
                if (err) {
                    throw err
                }
                orig = test[0].toObject();
                Test.findByIdAndUpdate(test[0]._id, {$set:{aString:'NewVal', 'subObject.attrib':2}, $push:{strings:'add'}}, function (err: any) {
                    if (err) { throw err }
                    done();
                })
            });
        });

        it('creates an audit record', function (done) {
            fngAudit.Audit.count({}, function (err: any, count: number) {
                assert.isNull(err);
                assert.equal(count, 1);
                done();
            });
        });

        it('records changes in audit record', function (done) {
            fngAudit.Audit.find({c: 'test', cId: orig._id}, function (err: any, auditRecs: Array<any>) {
                assert.equal(auditRecs.length, 1);
                assert.exists(auditRecs[0].chg);
                done();
            });
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(obj.toObject()), fngAudit.clean(orig));
                done();
            })
        });


    });

    describe('remove', function() {

        let orig: any;

        beforeEach(function (done) {
            orig = {aString: 'Original', aNumber: 1};
            Test.create([orig], function (err: any, test: mongoose.Document[]) {
                if (err) {
                    throw err
                }
                orig = test[0].toObject();
                delete orig.__v;
                test[0].remove(function (err) {
                    if (err) {
                        throw err
                    }
                    done();
                })
            });
        });

        it('creates an audit record', function (done) {
            fngAudit.Audit.count({}, function (err: any, count: number) {
                assert.isNull(err);
                assert.equal(count, 1);
                done();
            });
        });

        it('records changes in audit record', function (done) {
            fngAudit.Audit.find({c: 'test', cId: orig._id}, function (err: any, auditRecs: Array<any>) {
                assert.equal(auditRecs.length, 1);
                assert.exists(auditRecs[0].chg);
                done();
            });
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });

    });

    describe('update', function() {

        it('creates an audit record');

    });

    describe('findOneAndRemove', function() {

        it('creates an audit record');

    });

});