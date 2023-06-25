import * as chai from "chai";

import * as mongoose from 'mongoose';

let fngAudit = require("../src/server/fng-audit");

let assert = chai.assert;

mongoose.connect("mongodb://localhost:27017/fng_audit_test", {});
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

    it('works with example a', function() {
        let obj: any = {
            "_id": "5a1c67283238582fc7e90db3",
            "aString": "Original",
            "aNumber": 1,
            "__v": 0,
            "strings": []
        };
        assert.deepEqual({
            "_id": "5a1c67283238582fc7e90db3",
            "aString": "Original",
            "aNumber": 1,
        }, fngAudit.clean(obj))
    });

});

describe('Mongoose Plugin', function () {

    let handledErr: string;

    async function clearDownDB() {
        await Promise.all([
            Test.deleteMany({}),
            fngAudit.Audit.deleteMany({})
        ])
    }

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
        }, function(array: Array<any>) {return array},{errorHandler: function(err: string) {
                handledErr = err.toString();
            }
        });
    });

    describe('Error handling', function() {

        it ('calls an error handler', async function() {
            let test: mongoose.Document[] = await Test.create([{aString: 'Original'}]);
            await Test.findByIdAndUpdate(test[0]._id, {$rename:{aString:'NewVal'}})
                .catch(function () {
                    assert.equal(handledErr, 'No audit trail support for $rename');
                });
            assert.equal(handledErr, 'No audit trail support for $rename');
        });

    });

    describe('save', function () {

        let orig: any, modified: any, origId: string;

        before(async function() {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1};
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            origId = orig._id.toString();
            test[0].set({aString: 'Update', aNumber: 2, aBoolean: true});
            let test2: mongoose.Document = await test[0].save();
            modified = test2.toObject();
        })

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, origId, '0',  true,function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(obj, fngAudit.clean(orig));
                done();
            })
        });

        it('returns history', function(done) {
            fngAudit.getAuditTrail({getResource: () => true, extractTimestampFromMongoID: () => new Date()}, 'test', origId, null,function(err: any, obj: any) {
                assert.isNull(err);
                assert.match(obj[0].comment, /modified /);
                assert.match(obj[0].comment, /aBoolean/);
                assert.match(obj[0].comment, /aNumber/);
                assert.match(obj[0].comment, /aString/);
                done();
            });
        })

    });

    describe('findOneAndUpdate', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1, subObject: {attrib: 1}};
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            await Test.findByIdAndUpdate(test[0]._id, {
                $set: {aString: 'NewVal', 'subObject.attrib': 2},
                $push: {strings: 'add'}
            });
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false,function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });


    });

    describe('findOneAndUpdate - using an object or new vals', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1, subObject: {attrib: 1}};
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            await Test.findByIdAndUpdate(test[0]._id, {aString: 'NewVal'})
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false,function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('update', function() {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1};
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            await Test.updateOne({aString: 'New'});
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });

    });

    describe('updateOne', function() {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1, subObject: {attrib: 1}};
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            await Test.updateOne({aString: 'New', 'subObject.attrib': 42});
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id})
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false,function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });

    });

    describe('findByIdAndRemove', function() {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1};
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            delete orig.__v;
            await Test.findByIdAndRemove(test[0]._id);
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> =  await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });

    });

    describe('deleteOne', function() {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1};
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            delete orig.__v;
            await Test.deleteOne({aString: 'Original'});
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0',false, function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('findOneAndDelete', function() {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1};
            let  test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            delete orig.__v;
            await Test.findOneAndDelete({aString: 'Original'});
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('findOneAndRemove', function() {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1};
            let test: mongoose.Document[] = await Test.create([orig])
            orig = test[0].toObject();
            delete orig.__v;
            await Test.findOneAndRemove({aString: 'Original'});
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('deleteMany', function() {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1};
            let test: mongoose.Document[] = await Test.create([orig])
            orig = test[0].toObject();
            delete orig.__v;
            await Test.findOneAndRemove({aString: 'Original'});
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('updateMany', function() {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = {aString: 'Original', aNumber: 1};
            let test: mongoose.Document[] = await Test.create([orig])
            orig = test[0].toObject();
            await Test.updateMany({aString: 'New'});
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({c: 'test', cId: orig._id});
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function(done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function(err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });

    });

});
