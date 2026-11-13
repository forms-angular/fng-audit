import mongoose from 'mongoose';

import fngAudit from "../src/server/fng-audit.js";
import { assert } from 'chai';

mongoose.connect("mongodb://127.0.0.1:27017/fng_audit_test", {});
(<any>mongoose).Promise = global.Promise;
// mongoose.set('debug', true);

let testSchema = new mongoose.Schema(
    {
        aString: { type: String },
        aNumber: { type: Number },
        aBoolean: { type: Boolean },
        aDate: { type: Date },
        strings: { type: [String] },
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

let secureTestSchema = new mongoose.Schema(
    {
        name: { type: String },
        login: {
            username: { type: String },
            hash: { type: String, secure: true },
            keys: {
                type: [new mongoose.Schema({
                    label: { type: String },
                    keyHash: { type: String, secure: true }
                })]
            }
        }
    });

secureTestSchema.plugin(fngAudit.plugin);

let SecureTest: any;
try {
    SecureTest = mongoose.model("securetest");
} catch (e) {
    SecureTest = mongoose.model("securetest", secureTestSchema);
}

describe('Object cleaning', function () {

    it('returns a simple populated object', function () {
        let obj = { a: 1, b: 'two' };
        assert.deepEqual(obj, fngAudit.clean(obj))
    });

    it('returns a nested object', function () {
        let obj = { a: 1, b: 'two', c: { c1: 1, c2: 'two' } };
        assert.deepEqual(obj, fngAudit.clean(obj))
    });

    it('strips out an empty array', function () {
        let obj: any = { a: 1, b: 'two', c: [] };
        let obj2 = fngAudit.clean(obj);
        assert.equal(obj.a, obj2.a);
        assert.equal(obj.b, obj2.b);
        assert.isUndefined(obj2.c);
    });

    it('handles an array of strings', function () {
        let obj = { a: 1, b: 'two', c: ['abb', 'ssss'] };
        assert.deepEqual(obj, fngAudit.clean(obj))
    });

    it('handles an array of populated objects', function () {
        let obj = { a: 1, b: 'two', c: [{ a: 'abb' }, { a: 'ssss' }] };
        assert.deepEqual(obj, fngAudit.clean(obj))
    });

    it('strips empty arrays from an array of populated objects', function () {
        let obj: any = { a: 1, b: 'two', c: [{ a: 'abb', b: [] }, { a: 'ssss', b: ['asds'] }] };
        let obj2 = fngAudit.clean(obj);
        assert.isUndefined(obj2.c[0].b);
    });

    it('strips empty objects that only contained empty arrays', function () {
        let obj: any = { a: 1, b: 'two', loseMe: { b: [], c: [] } };
        let obj2 = fngAudit.clean(obj);
        assert.isUndefined(obj2.loseMe);
    });

    it('works with example a', function () {
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
            getResourceFromCollection: function () {
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
        }, function (array: Array<any>) { return array }, {
            errorHandler: function (err: string) {
                handledErr = err.toString();
            }
        });
    });

    describe('Error handling', function () {

        it('calls an error handler', async function () {
            let test: mongoose.Document[] = await Test.create([{ aString: 'Original' }]);
            await Test.findByIdAndUpdate(test[0]._id, { $rename: { aString: 'NewVal' } })
                .catch(function () {
                    assert.equal(handledErr, 'No audit trail support for $rename');
                });
            assert.equal(handledErr, 'No audit trail support for $rename');
        });

    });

    describe('auditAdHocEvent', function () {

        it('copes with null values in the details', async function () {
            const rec: any = await fngAudit.auditAdHocEvent('someone', 'Ad hoc', { a: null, b: { 'c.d': 1, e: null } });
            assert.deepEqual(rec.dets, { a: null, b: { 'c-d': 1, e: null } });
        });

    });

    describe('save', function () {

        let orig: any, modified: any, origId: string;

        before(async function () {
            await clearDownDB();
            orig = { aString: 'Original', aNumber: 1 };
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            origId = orig._id.toString();
            test[0].set({ aString: 'Update', aNumber: 2, aBoolean: true });
            let test2: mongoose.Document = await test[0].save();
            modified = test2.toObject();
        })

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, origId, '0', true, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(obj, fngAudit.clean(orig));
                done();
            })
        });

        it('returns history', function (done) {
            fngAudit.getAuditTrail({ getResource: () => true, extractTimestampFromMongoID: () => new Date() }, 'test', origId, null, function (err: any, obj: any) {
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
            orig = { aString: 'Original', aNumber: 1, subObject: { attrib: 1 } };
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            await Test.findByIdAndUpdate(test[0]._id, {
                $set: { aString: 'NewVal', 'subObject.attrib': 2 },
                $push: { strings: 'add' }
            });
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
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
            orig = { aString: 'Original', aNumber: 1, subObject: { attrib: 1 } };
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            await Test.findByIdAndUpdate(test[0]._id, { aString: 'NewVal' })
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('update', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = { aString: 'Original', aNumber: 1 };
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            await Test.updateOne({ aString: 'New' });
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });

    });

    describe('updateOne', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = { aString: 'Original', aNumber: 1, subObject: { attrib: 1 } };
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            await Test.updateOne({ aString: 'New', 'subObject.attrib': 42 });
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id })
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });

    });

    describe('findByIdAndRemove', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = { aString: 'Original', aNumber: 1 };
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
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });

    });

    describe('deleteOne', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = { aString: 'Original', aNumber: 1 };
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            delete orig.__v;
            await Test.deleteOne({ aString: 'Original' });
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('findOneAndDelete', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = { aString: 'Original', aNumber: 1 };
            let test: mongoose.Document[] = await Test.create([orig]);
            orig = test[0].toObject();
            delete orig.__v;
            await Test.findOneAndDelete({ aString: 'Original' });
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('findOneAndRemove', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = { aString: 'Original', aNumber: 1 };
            let test: mongoose.Document[] = await Test.create([orig])
            orig = test[0].toObject();
            delete orig.__v;
            await Test.findOneAndRemove({ aString: 'Original' });
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('deleteMany', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = { aString: 'Original', aNumber: 1 };
            let test: mongoose.Document[] = await Test.create([orig])
            orig = test[0].toObject();
            delete orig.__v;
            await Test.findOneAndRemove({ aString: 'Original' });
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });
    });

    describe('updateMany', function () {

        let orig: any;

        before(async function () {
            await clearDownDB();
            orig = { aString: 'Original', aNumber: 1 };
            let test: mongoose.Document[] = await Test.create([orig])
            orig = test[0].toObject();
            await Test.updateMany({ aString: 'New' });
        });

        it('creates an audit record', async function () {
            let count = await fngAudit.Audit.countDocuments({});
            assert.equal(count, 1);
        });

        it('records changes in audit record', async function () {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id });
            assert.equal(auditRecs.length, 1);
            assert.exists(auditRecs[0].chg);
        });

        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", function (err: any, obj: any) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            })
        });

    });


    describe('query $set of values that are falsy or objects', function () {

        const cases: { [k: string]: { orig: any, set: any, expected: any } } = {
            aNumber: { orig: 5, set: 0, expected: [5, 0] },
            aBoolean: { orig: true, set: false, expected: [true, false] },
            aString: { orig: 'old', set: '', expected: ['old', ''] },
            aDate: { orig: new Date('2020-01-01'), set: new Date('2026-01-02'), expected: ['2020-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'] },
            subObject: { orig: { attrib: 1 }, set: { attrib: 2 }, expected: { attrib: [1, 2] } },
        };

        Object.keys(cases).forEach((key) => {
            it(`records the new value of ${key}`, async function () {
                await clearDownDB();
                let test: mongoose.Document[] = await Test.create([{ [key]: cases[key].orig }]);
                let orig: any = test[0].toObject();
                await Test.updateOne({ _id: orig._id }, { $set: { [key]: cases[key].set } });
                let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: orig._id }).lean();
                assert.equal(auditRecs.length, 1);
                assert.deepEqual(auditRecs[0].chg[key], cases[key].expected);
                let obj: any = await new Promise((resolve, reject) => {
                    fngAudit.getVersion(Test, orig._id.toString(), '0', false, "bail", (err: any, obj: any) => err ? reject(err) : resolve(obj));
                });
                assert.deepEqual(JSON.parse(JSON.stringify(obj))[key], JSON.parse(JSON.stringify(orig))[key]);
            });
        });

        it('records the new value of an array', async function () {
            await clearDownDB();
            let test: mongoose.Document[] = await Test.create([{ strings: ['a'] }]);
            let id = test[0]._id;
            await Test.updateOne({ _id: id }, { $set: { strings: ['z'] } });
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'test', cId: id }).lean();
            assert.include(JSON.stringify(auditRecs[0].chg), '"z"');
        });

    });

    describe('secure fields', function () {

        let id: any;

        async function auditText(): Promise<string> {
            let auditRecs: Array<any> = await fngAudit.Audit.find({ c: 'securetest', cId: id }).lean();
            return JSON.stringify(auditRecs.map(a => a.chg));
        }

        beforeEach(async function () {
            await Promise.all([SecureTest.deleteMany({}), fngAudit.Audit.deleteMany({})]);
            let docs: mongoose.Document[] = await SecureTest.create([{
                name: 'Original',
                login: { username: 'u1', hash: 'SECRET-HASH-1', keys: [{ label: 'k1', keyHash: 'SECRET-KEY-1' }] }
            }]);
            id = docs[0]._id;
        });

        it('are left out when a document is saved', async function () {
            let doc = await SecureTest.findById(id);
            doc.set({ name: 'Update', 'login.hash': 'SECRET-HASH-2' });
            doc.login.keys.push({ label: 'k2', keyHash: 'SECRET-KEY-2' });
            await doc.save();
            let text = await auditText();
            assert.include(text, 'Update');
            assert.include(text, 'k2');
            assert.notInclude(text, 'SECRET');
        });

        it('are left out of a $set', async function () {
            await SecureTest.findByIdAndUpdate(id, { $set: { name: 'Update', 'login.hash': 'SECRET-HASH-2' } });
            let text = await auditText();
            assert.include(text, 'Update');
            assert.notInclude(text, 'SECRET');
        });

        it('are left out of a $push', async function () {
            await SecureTest.updateOne({ _id: id }, { $push: { 'login.keys': { label: 'k2', keyHash: 'SECRET-KEY-2' } } });
            let text = await auditText();
            assert.include(text, 'k2');
            assert.notInclude(text, 'SECRET');
        });

        it('are left out of a positional $set', async function () {
            await SecureTest.updateOne({ _id: id }, { $set: { 'login.keys.0.keyHash': 'SECRET-KEY-2', 'login.keys.0.label': 'k1b' } });
            let text = await auditText();
            assert.include(text, 'k1b');
            assert.notInclude(text, 'SECRET');
        });

        it('are left out when a document is deleted', async function () {
            await SecureTest.deleteOne({ _id: id });
            let text = await auditText();
            assert.include(text, 'Original');
            assert.notInclude(text, 'SECRET');
        });

        it('are left out when a subdocument is removed', async function () {
            await SecureTest.findByIdAndUpdate(id, { $set: { login: { username: 'u2' } } });
            let text = await auditText();
            assert.include(text, 'u2');
            assert.notInclude(text, 'SECRET');
        });

    });

});

describe('describeChanges', function () {

    const contactSchema = new mongoose.Schema({
        contact: { type: mongoose.Schema.Types.ObjectId, ref: 'person' },
        relationship: { type: String, form: { label: 'Relationship to Client' } },
        pin: { type: String, secure: true }
    } as any);
    const schema = new mongoose.Schema({
        client: {
            ssId: { type: String, form: { label: 'SS Reference' } },
            allergies: String,
            startDate: Date
        },
        hiddenThing: { type: String, form: { hidden: true } },
        contactList: [contactSchema],
        tags: [String]
    } as any);

    it('labels a changed nested field from form.label', function () {
        const details = fngAudit.describeChanges(schema, { client: { ssId: ['123456', '1234567'] } });
        assert.deepEqual(details, [{
            path: 'client.ssId', label: 'SS Reference', kind: 'changed',
            from: { value: '123456', type: 'String', ref: undefined },
            to: { value: '1234567', type: 'String', ref: undefined }
        }]);
    });

    it('title-cases a field without a label and reports added and removed values', function () {
        const details = fngAudit.describeChanges(schema, { client: { allergies: ['Penicillin'], startDate: ['2026-01-01T00:00:00.000Z', 0, 0] } });
        assert.equal(details[0].label, 'Allergies');
        assert.equal(details[0].kind, 'added');
        assert.equal(details[0].to.value, 'Penicillin');
        assert.equal(details[1].label, 'Start Date');
        assert.equal(details[1].kind, 'removed');
        assert.equal(details[1].from.type, 'Date');
    });

    it('leaves out secure fields but not form-hidden ones', function () {
        assert.deepEqual(fngAudit.describeChanges(schema, { contactList: { _t: 'a', '0': { pin: ['1', '2'] } } }), []);
        assert.equal(fngAudit.describeChanges(schema, { hiddenThing: ['a', 'b'] }).length, 1);
    });

    it('describes an added array item field by field, without secure fields', function () {
        const details = fngAudit.describeChanges(schema, {
            contactList: { _t: 'a', '1': [{ _id: '6b0000000000000000000001', contact: '6b0000000000000000034907', relationship: 'GP', pin: '1234' }] }
        });
        assert.equal(details.length, 1);
        assert.equal(details[0].label, 'Contact List #2');
        assert.equal(details[0].kind, 'added');
        assert.deepEqual(details[0].to.fields, [
            { label: 'Contact', value: '6b0000000000000000034907', type: 'ObjectId', ref: 'person' },
            { label: 'Relationship to Client', value: 'GP', type: 'String', ref: undefined }
        ]);
    });

    it('describes a change within an array item and a removed item', function () {
        const details = fngAudit.describeChanges(schema, {
            contactList: { _t: 'a', '0': { relationship: ['Son', 'Nephew'] }, '_2': [{ relationship: 'Friend' }, 0, 0], '_3': ['', 1, 3] }
        });
        assert.equal(details.length, 2);
        assert.equal(details[0].label, 'Contact List #1 Relationship to Client');
        assert.equal(details[0].path, 'contactList.1.relationship');
        assert.equal(details[0].from.value, 'Son');
        assert.equal(details[0].to.value, 'Nephew');
        assert.equal(details[1].label, 'Contact List #3');
        assert.equal(details[1].kind, 'removed');
    });

    it('describes primitive array changes', function () {
        const details = fngAudit.describeChanges(schema, { tags: { _t: 'a', '0': ['new'], '_0': ['old', 0, 0] } });
        assert.deepEqual(details.map((d: any) => [d.label, d.kind]), [['Tags #1', 'added'], ['Tags #1', 'removed']]);
    });

    it('decodes a long-text diff', function () {
        const diff = '@@ -1,8 +1,9 @@\n Face \n-mask\n+gloves\n s mu\n';
        const details = fngAudit.describeChanges(schema, { client: { allergies: [diff, 0, 2] } });
        assert.equal(details[0].kind, 'text');
        assert.deepEqual(details[0].textDiff, [
            { op: '=', text: 'Face ' }, { op: '-', text: 'mask' }, { op: '+', text: 'gloves' }, { op: '=', text: 's mu' }
        ]);
    });

    it('copes with no schema', function () {
        const details = fngAudit.describeChanges(undefined, { someField: [1, 2] });
        assert.equal(details[0].label, 'Some Field');
    });
});

describe('describeChanges with nested objects', function () {
    it('labels the fields of a removed nested object from the parent schema', function () {
        const schema = new mongoose.Schema({ sysUserData: { contextOrgId: { type: mongoose.Schema.Types.ObjectId, ref: 'organisation', form: { label: 'Context' } } } } as any);
        const details = fngAudit.describeChanges(schema, { sysUserData: [{ contextOrgId: '5a0329454fb44007634b987c' }, 0, 0] });
        assert.deepEqual(details[0].from.fields, [{ label: 'Context', value: '5a0329454fb44007634b987c', type: 'ObjectId', ref: 'organisation' }]);
    });
});

describe('recordVisible and the history routes', function () {
    const mine = new mongoose.Types.ObjectId();
    const theirs = new mongoose.Types.ObjectId();
    const gone = new mongoose.Types.ObjectId();
    const routes: { [path: string]: (req: any, res: any) => void } = {};
    let findFunc: any;
    let auditFindFunc: any;   // undefined: the audit resource has no findFunc

    const fng: any = {
        mongoose,
        options: {},
        app: { get: function (path: string, handler: any) { routes[path] = handler; } },
        getResource: (name: string) => name === 'test' ? { resourceName: 'test', model: Test, options: {} } :
            name === 'audit' && auditFindFunc !== undefined ? { resourceName: 'audit', model: fngAudit.Audit, options: { findFunc: () => { } } } : undefined,
        getResourceFromCollection: () => ({ resourceName: 'test', model: Test, options: {} }),
        extractTimestampFromMongoID: (id: any) => new Date(parseInt(id.toString().substring(0, 8), 16) * 1000),
        doFindFuncPromise: async (req: any, resource: any) => resource.resourceName === 'audit' ? auditFindFunc : findFunc,
    };

    function call(path: string, params: any): Promise<{ status: number, body: any }> {
        return new Promise((resolve) => {
            const res: any = {
                status(code: number) { res.code = code; return res; },
                send(body: any) { resolve({ status: res.code, body }); },
            };
            routes[path]({ params }, res);
        });
    }

    before(async function () {
        await Promise.all([Test.deleteMany({}), fngAudit.Audit.deleteMany({})]);
        await Test.create([{ _id: mine, aString: 'mine' }, { _id: theirs, aString: 'theirs' }]);
        for (const id of [mine, theirs]) {
            const doc = await Test.findById(id);
            doc.set({ aString: 'changed' });
            await doc.save();
        }
        fngAudit.controller(fng, (_options: any, array: Array<any>) => array, {});
    });

    beforeEach(function () {
        findFunc = null;
        auditFindFunc = undefined;
    });

    after(async function () {
        await Promise.all([Test.deleteMany({}), fngAudit.Audit.deleteMany({})]);
    });

    it('allows any record when the resource has no findFunc', async function () {
        assert.isTrue(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, theirs.toString()));
        assert.isTrue(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, gone.toString()));
    });

    it('allows only records the findFunc matches', async function () {
        findFunc = { _id: mine };
        assert.isTrue(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, mine.toString()));
        assert.isFalse(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, theirs.toString()));
        assert.isFalse(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, gone.toString()));
    });

    describe('a deleted record', function () {
        let deleted: mongoose.Types.ObjectId;

        before(async function () {
            deleted = new mongoose.Types.ObjectId();
            await fngAudit.Audit.create({ c: 'test', cId: deleted, op: 'delete', xtra: { org: 'orgA' } });
        });

        it('is visible when the audit findFunc lets the user see its audit rows', async function () {
            findFunc = { _id: mine };
            auditFindFunc = { 'xtra.org': { $in: ['orgA'] } };
            assert.isTrue(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, deleted.toString()));
        });

        it('is visible to a user the audit findFunc does not restrict', async function () {
            findFunc = { _id: mine };
            auditFindFunc = null;
            assert.isTrue(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, deleted.toString()));
        });

        it('is hidden from a user whose audit findFunc excludes its audit rows', async function () {
            findFunc = { _id: mine };
            auditFindFunc = { 'xtra.org': { $in: ['orgB'] } };
            assert.isFalse(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, deleted.toString()));
        });

        it('is hidden when there is no audit findFunc to go by', async function () {
            findFunc = { _id: mine };
            assert.isFalse(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, deleted.toString()));
        });

        it('does not open up a record that exists but is hidden', async function () {
            findFunc = { _id: mine };
            auditFindFunc = null;
            assert.isFalse(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, theirs.toString()));
        });
    });

    it('is not fooled by a findFunc that uses _id itself', async function () {
        findFunc = { _id: theirs };
        assert.isFalse(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, mine.toString()));
    });

    it('refuses an id that is not an ObjectId', async function () {
        assert.isFalse(await fngAudit.recordVisible(fng, fng.getResource('test'), {}, 'nonsense'));
    });

    for (const [path, extra] of [[':model/:id/history', {}], [':model/:id/changes', {}], [':model/:id/version/:version', { version: '0' }]] as any) {
        it(`${path} returns the trail of a visible record`, async function () {
            findFunc = { _id: mine };
            const r = await call(path, { model: 'test', id: mine.toString(), ...extra });
            assert.equal(r.status, 200);
            assert.exists(r.body);
        });

        it(`${path} says 404 for a record the findFunc hides`, async function () {
            findFunc = { _id: mine };
            const r = await call(path, { model: 'test', id: theirs.toString(), ...extra });
            assert.equal(r.status, 404);
            assert.notInclude(JSON.stringify(r.body), 'theirs');
        });

        it(`${path} says 404 for an unknown model`, async function () {
            const r = await call(path, { model: 'nothing', id: mine.toString(), ...extra });
            assert.equal(r.status, 404);
        });
    }
});
