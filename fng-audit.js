"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="mongoose" />
var jsondiffpatch = require("jsondiffpatch");
var async = require("async");
var Mongoose = require("mongoose");
var mongooseInstance;
var formsAngular;
var auditOptions = {};
function controller(fng, processArgs, options) {
    formsAngular = fng;
    mongooseInstance = formsAngular.mongoose;
    auditOptions = options || {};
    var auditSchema = new Mongoose.Schema({
        c: String,
        cId: { type: Mongoose.Schema.Types.ObjectId },
        chg: {},
        // user: {},  // First of req.user._id, req.user (presumably populated by authentication middleware), req.headers['x-forwarded-for'] or req.connection.remoteAddress
        ver: Number
    });
    var modelName = 'audit';
    try {
        exports.Audit = mongooseInstance.model(modelName);
    }
    catch (e) {
        exports.Audit = mongooseInstance.model(modelName, auditSchema);
    }
    fng.app.get('/:model/:id/history', function (req, res) {
        res.status(200).send('Hello');
    });
    fng.app.get('/:model/:id/snapshot/:date', function (req, res) {
        res.status(200).send('Hello');
    });
    fng.app.get('/:model/:id/version/:version', function (req, res) {
        getVersion(fng.getResource(req.params.model), req.params.id, req.params.version, function (err, obj) {
            if (err) {
                res.status(404).send(err);
            }
            else {
                res.status(200).send(obj);
            }
        });
    });
}
exports.controller = controller;
function getAuditTrail(modelName, id, callback) {
    exports.Audit.find({ c: modelName, cId: id }, function (err, trail) {
        if (err) {
            return callback(err);
        }
        async.map(trail, function (changeRec, mapCallback) {
            var changedValues = [];
            var changedFields = [];
            for (var key in changeRec.chg) {
                if (changeRec.chg.hasOwnProperty(key)) {
                    changedFields.push(key);
                }
            }
            var comment = "modified " + changedFields.concat(changedValues).join(", ");
            return mapCallback(null, {
                // changedBy: history.user,
                changedAt: formsAngular.extractTimestampFromMongoID(changeRec._id),
                oldVersion: changeRec.ver,
                comment: comment
            });
        }, function (err, output) {
            if (err) {
                console.error(err);
                return callback(err, null);
            }
            return callback(null, output);
        });
    });
}
exports.getAuditTrail = getAuditTrail;
function getVersion(model, id, version, callback) {
    model.findOne({ _id: id }, function (err, latest) {
        if (err) {
            console.error(err);
            return callback(err, null);
        }
        exports.Audit.find({ c: model.modelName, cId: id, ver: { $gte: parseInt(version, 10) } }, { ver: 1, chg: 1 }, { sort: "-ver" }, function (err, histories) {
            if (err) {
                console.error(err);
                return callback(err, null);
            }
            var object = latest ? latest : {};
            async.each(histories, function (history, eachCallback) {
                jsondiffpatch.unpatch(object, history.chg);
                eachCallback();
            }, function (err) {
                if (err) {
                    console.error(err);
                    return callback(err, null);
                }
                callback(null, object);
            });
        });
    });
}
exports.getVersion = getVersion;
function stripAttribFromObject(attrib, object) {
    var cur = object;
    var tree = attrib.split('.');
    var last = tree.pop();
    tree.forEach(function (branch) { if (cur) {
        cur = cur[branch];
    } });
    if (cur) {
        delete cur[last];
    }
}
function clean(obj, delFunc) {
    delFunc = delFunc || function (obj, key) { delete obj[key]; };
    var _loop_1 = function (key) {
        if (obj.hasOwnProperty(key) && typeof obj[key] === "object") {
            if (Array.isArray(obj[key])) {
                if (obj[key].length === 0) {
                    delFunc(obj, key);
                }
                else {
                    obj[key].forEach(function (elm, index) {
                        obj[key][index] = clean(obj[key][index], delFunc);
                    });
                }
            }
            else {
                var cleaned = clean(obj[key], delFunc);
                if (Object.keys(cleaned).length > 0) {
                    obj[key] = cleaned;
                }
                else {
                    delFunc(obj, key);
                }
            }
        }
    };
    for (var key in obj) {
        _loop_1(key);
    }
    return obj;
}
exports.clean = clean;
function auditFromObject(doc, orig, updated, options, next) {
    // Remove the stuff you never want to audit
    var stdOrig = clean(JSON.parse(JSON.stringify(orig)));
    var stdUpdated = clean(JSON.parse(JSON.stringify(updated)));
    var suppressedChanges = ['updatedAt', '__v'];
    ['strip', 'hidden'].forEach(function (prop) {
        if (options[prop] && options[prop].length > 0) {
            suppressedChanges.push(options[prop]);
        }
    });
    suppressedChanges.forEach(function (attrib) {
        stripAttribFromObject(attrib, stdOrig);
        stripAttribFromObject(attrib, stdUpdated);
    });
    var chg = jsondiffpatch.diff(stdOrig, stdUpdated);
    if (chg) {
        var c_1 = doc.constructor.modelName;
        var cId_1 = doc._id;
        exports.Audit.findOne({ c: c_1, cId: cId_1 }).sort("-ver").exec(function (err, prevAudit) {
            // Audit.findOne({c: c, cId: cId}, function (err:any, prevAudit:any) {
            if (err) {
                return next(err);
            }
            exports.Audit.create({
                c: c_1,
                cId: cId_1,
                ver: prevAudit ? prevAudit.ver + 1 : 0,
                chg: chg
            }, next);
        });
    }
    else {
        next();
    }
}
function assignPossiblyNested(dest, src, attrib) {
    var tree = attrib.split('.');
    var last = tree.pop();
    var srcVal;
    var cur;
    if (typeof src !== "object") {
        // We are assigning a value
        srcVal = src;
    }
    else {
        // we are copying from an analogous object
        cur = src;
        tree.forEach(function (branch) {
            if (cur)
                cur = cur[branch];
        });
        if (cur) {
            srcVal = cur[last];
        }
    }
    if (srcVal) {
        cur = dest;
        tree.forEach(function (branch) {
            if (!cur[branch]) {
                cur[branch] = {};
            }
            cur = cur[branch];
        });
        cur[last] = srcVal;
    }
}
function auditFromUpdate(docUpdate, options, next) {
    var queryObject = docUpdate;
    queryObject.find(queryObject._conditions, function (err, results) {
        if (err) {
            return next(err);
        }
        else {
            async.eachSeries(results, function (currentObject, callback) {
                var original = {};
                var updated = {};
                Object.keys(queryObject._update).forEach(function (key) {
                    Object.keys(queryObject._update[key]).forEach(function (attrib) {
                        if (key === '$set') {
                            assignPossiblyNested(updated, queryObject._update.$set[attrib], attrib);
                        }
                        assignPossiblyNested(original, currentObject, attrib);
                    });
                    switch (key) {
                        case '$set':
                            // ignore $set - already dealt with
                            break;
                        case '$push':
                            Object.keys(queryObject._update[key]).forEach(function (attrib) {
                                updated[attrib] = [];
                                Object.assign(updated[attrib], original[attrib]);
                                updated[attrib].push(queryObject._update[key][attrib]);
                            });
                            break;
                        default:
                            var errMessage = 'No audit trail support for ' + key;
                            if (auditOptions.errorHandler) {
                                auditOptions.errorHandler(errMessage);
                            }
                            else {
                                console.error(errMessage);
                            }
                            break;
                    }
                });
                auditFromObject(currentObject, original, updated, options, function () {
                    callback();
                });
            }, function done() {
                return next();
            });
        }
    });
}
function getHiddenFields(collectionName, options) {
    if (!options.hidden) {
        options.hidden = formsAngular.getResourceFromCollection(collectionName).options.hide;
    }
}
function plugin(schema, options) {
    options = options || {};
    options.strip = options.strip || [];
    schema.pre("findOneAndUpdate", function (next) {
        if (this.isNew || this.__noAudit) {
            next();
        }
        else {
            getHiddenFields(this.mongooseCollection.collectionName, options);
            auditFromUpdate(this, options, next);
        }
    });
    schema.pre("save", function (next) {
        if (this.isNew || this.__noAudit) {
            next();
        }
        else {
            var that_1 = this;
            getHiddenFields(that_1.constructor.collection.collectionName, options);
            that_1.constructor.findOne({ _id: that_1._id }, function (err, original) {
                auditFromObject(that_1, original, that_1, options, next);
            });
        }
    });
    schema.pre("update", function (next) {
        if (this.__noAudit) {
            next();
        }
        else {
            console.log('In update');
            getHiddenFields(this.mongooseCollection.collectionName, options);
            auditFromUpdate(this, options, next);
        }
    });
    schema.pre("remove", function (next) {
        if (this.__noAudit) {
            next();
        }
        else {
            var that = this;
            console.log('In remove');
            getHiddenFields(that.constructor.collection.collectionName, options);
            auditFromObject(that, that, {}, options, next);
        }
    });
}
exports.plugin = plugin;
//# sourceMappingURL=fng-audit.js.map