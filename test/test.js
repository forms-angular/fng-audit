"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var chai = require("chai");
var mongoose = require("mongoose");
var fngAudit = require("../src/server/fng-audit");
var assert = chai.assert;
mongoose.connect("mongodb://127.0.0.1:27017/fng_audit_test", {});
mongoose.Promise = global.Promise;
// mongoose.set('debug', true);
var testSchema = new mongoose.Schema({
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
var Test;
try {
    Test = mongoose.model("test");
}
catch (e) {
    Test = mongoose.model("test", testSchema);
}
describe('Object cleaning', function () {
    it('returns a simple populated object', function () {
        var obj = { a: 1, b: 'two' };
        assert.deepEqual(obj, fngAudit.clean(obj));
    });
    it('returns a nested object', function () {
        var obj = { a: 1, b: 'two', c: { c1: 1, c2: 'two' } };
        assert.deepEqual(obj, fngAudit.clean(obj));
    });
    it('strips out an empty array', function () {
        var obj = { a: 1, b: 'two', c: [] };
        var obj2 = fngAudit.clean(obj);
        assert.equal(obj.a, obj2.a);
        assert.equal(obj.b, obj2.b);
        assert.isUndefined(obj2.c);
    });
    it('handles an array of strings', function () {
        var obj = { a: 1, b: 'two', c: ['abb', 'ssss'] };
        assert.deepEqual(obj, fngAudit.clean(obj));
    });
    it('handles an array of populated objects', function () {
        var obj = { a: 1, b: 'two', c: [{ a: 'abb' }, { a: 'ssss' }] };
        assert.deepEqual(obj, fngAudit.clean(obj));
    });
    it('strips empty arrays from an array of populated objects', function () {
        var obj = { a: 1, b: 'two', c: [{ a: 'abb', b: [] }, { a: 'ssss', b: ['asds'] }] };
        var obj2 = fngAudit.clean(obj);
        assert.isUndefined(obj2.c[0].b);
    });
    it('strips empty objects that only contained empty arrays', function () {
        var obj = { a: 1, b: 'two', loseMe: { b: [], c: [] } };
        var obj2 = fngAudit.clean(obj);
        assert.isUndefined(obj2.loseMe);
    });
    it('works with example a', function () {
        var obj = {
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
        }, fngAudit.clean(obj));
    });
});
describe('Mongoose Plugin', function () {
    var handledErr;
    function clearDownDB() {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.all([
                            Test.deleteMany({}),
                            fngAudit.Audit.deleteMany({})
                        ])];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
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
                };
            },
            extractTimestampFromMongoID: function (id) {
                var timestamp = id.toString().substring(0, 8);
                return new Date(parseInt(timestamp, 16) * 1000);
            }
        }, function (array) { return array; }, { errorHandler: function (err) {
                handledErr = err.toString();
            }
        });
    });
    describe('Error handling', function () {
        it('calls an error handler', function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, Test.create([{ aString: 'Original' }])];
                        case 1:
                            test = _a.sent();
                            return [4 /*yield*/, Test.findByIdAndUpdate(test[0]._id, { $rename: { aString: 'NewVal' } })
                                    .catch(function () {
                                    assert.equal(handledErr, 'No audit trail support for $rename');
                                })];
                        case 2:
                            _a.sent();
                            assert.equal(handledErr, 'No audit trail support for $rename');
                            return [2 /*return*/];
                    }
                });
            });
        });
    });
    describe('save', function () {
        var orig, modified, origId;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test, test2;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1 };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            origId = orig._id.toString();
                            test[0].set({ aString: 'Update', aNumber: 2, aBoolean: true });
                            return [4 /*yield*/, test[0].save()];
                        case 3:
                            test2 = _a.sent();
                            modified = test2.toObject();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, origId, '0', true, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(obj, fngAudit.clean(orig));
                done();
            });
        });
        it('returns history', function (done) {
            fngAudit.getAuditTrail({ getResource: function () { return true; }, extractTimestampFromMongoID: function () { return new Date(); } }, 'test', origId, null, function (err, obj) {
                assert.isNull(err);
                assert.match(obj[0].comment, /modified /);
                assert.match(obj[0].comment, /aBoolean/);
                assert.match(obj[0].comment, /aNumber/);
                assert.match(obj[0].comment, /aString/);
                done();
            });
        });
    });
    describe('findOneAndUpdate', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1, subObject: { attrib: 1 } };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            return [4 /*yield*/, Test.findByIdAndUpdate(test[0]._id, {
                                    $set: { aString: 'NewVal', 'subObject.attrib': 2 },
                                    $push: { strings: 'add' }
                                })];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
    describe('findOneAndUpdate - using an object or new vals', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1, subObject: { attrib: 1 } };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            return [4 /*yield*/, Test.findByIdAndUpdate(test[0]._id, { aString: 'NewVal' })];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
    describe('update', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1 };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            return [4 /*yield*/, Test.updateOne({ aString: 'New' })];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
    describe('updateOne', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1, subObject: { attrib: 1 } };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            return [4 /*yield*/, Test.updateOne({ aString: 'New', 'subObject.attrib': 42 })];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
    describe('findByIdAndRemove', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1 };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            delete orig.__v;
                            return [4 /*yield*/, Test.findByIdAndRemove(test[0]._id)];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
    describe('deleteOne', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1 };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            delete orig.__v;
                            return [4 /*yield*/, Test.deleteOne({ aString: 'Original' })];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
    describe('findOneAndDelete', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1 };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            delete orig.__v;
                            return [4 /*yield*/, Test.findOneAndDelete({ aString: 'Original' })];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
    describe('findOneAndRemove', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1 };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            delete orig.__v;
                            return [4 /*yield*/, Test.findOneAndRemove({ aString: 'Original' })];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
    describe('deleteMany', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1 };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            delete orig.__v;
                            return [4 /*yield*/, Test.findOneAndRemove({ aString: 'Original' })];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
    describe('updateMany', function () {
        var orig;
        before(function () {
            return __awaiter(this, void 0, void 0, function () {
                var test;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, clearDownDB()];
                        case 1:
                            _a.sent();
                            orig = { aString: 'Original', aNumber: 1 };
                            return [4 /*yield*/, Test.create([orig])];
                        case 2:
                            test = _a.sent();
                            orig = test[0].toObject();
                            return [4 /*yield*/, Test.updateMany({ aString: 'New' })];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('creates an audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var count;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.countDocuments({})];
                        case 1:
                            count = _a.sent();
                            assert.equal(count, 1);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('records changes in audit record', function () {
            return __awaiter(this, void 0, void 0, function () {
                var auditRecs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fngAudit.Audit.find({ c: 'test', cId: orig._id })];
                        case 1:
                            auditRecs = _a.sent();
                            assert.equal(auditRecs.length, 1);
                            assert.exists(auditRecs[0].chg);
                            return [2 /*return*/];
                    }
                });
            });
        });
        it('returns version 0', function (done) {
            fngAudit.getVersion(Test, orig._id.toString(), '0', false, function (err, obj) {
                assert.isNull(err);
                assert.deepEqual(fngAudit.clean(JSON.parse(JSON.stringify(obj))), fngAudit.clean(JSON.parse(JSON.stringify(orig))));
                done();
            });
        });
    });
});
//# sourceMappingURL=test.js.map