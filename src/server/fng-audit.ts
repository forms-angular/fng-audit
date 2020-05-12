import * as jsondiffpatch from 'jsondiffpatch';
import * as async from 'async';
import * as Mongoose from "mongoose";

interface AuditOptions {
    debug?: Boolean;
    errorHandler?: (err: string) => void;
}

interface AuditPluginOptions {
    strip?: Array<string>
    hidden?: Array<string>
}

let mongooseInstance: Mongoose.Mongoose;
let formsAngular: any;
let auditOptions: AuditOptions = {};
export let Audit: any;

export function controller(fng: any, processArgs: (options: any, array: Array<any>) => Array<any>, options: AuditOptions) {
    formsAngular = fng;
    mongooseInstance = formsAngular.mongoose;
    auditOptions = options || {};
    const auditSchema = new Mongoose.Schema({
        c: String,   //collection
        cId: {type: Mongoose.Schema.Types.ObjectId},
        chg: {},
        user: {},  // Taken from _user
        op: String,  // Taken from _op - what operation is being performed?
        ver: Number
    });

    const modelName = 'audit';
    try {
        Audit = mongooseInstance.model(modelName);
    } catch (e) {
        Audit = mongooseInstance.model(modelName, auditSchema);
    }

    function getCallback(res: any) {
        return function (err: Error, results: any) {
            if (err) {
                res.status(400).send(err.message);
            } else {
                res.status(200).send(results);
            }
        };
    }

    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/history', function (req: any, res: any) {
        getAuditTrail(fng, req.params.model, req.params.id, {}, getCallback(res))
    }]));

    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/changes', function (req: any, res: any) {
        getAuditTrail(fng, req.params.model, req.params.id,  {chg: {$exists: true}}, getCallback(res))
    }]));

    // Maybe add fng.app.get('/:model/:id/snapshot/:date'...);

    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/version/:version', function (req: any, res: any) {
        const resource = fng.getResource(req.params.model);
        if (resource) {
            getVersion(resource.model, req.params.id, req.params.version, getCallback(res));
        } else {
            res.status(404).send(`No such resource as ${req.params.model}`);
        }
    }]));
}

function extractPossiblyNestedPath(tree: string[], obj: any): any {
    tree.forEach(branch => {
        if (obj) {
            obj = obj[branch]
        }
    });
    return obj;
}

function stripAttribFromObject(attrib: string, obj: any) {
    let tree = attrib.split('.');
    let last = tree.pop();
    obj = extractPossiblyNestedPath(tree, obj);
    if (obj) {
        delete obj[last]
    }
}

export function clean(obj: any, delFunc?: any): any {

    delFunc = delFunc || function(obj: any, key: any) {delete obj[key]};

    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (key === '__v') {
                delFunc(obj, key);
            } else {
                if (typeof obj[key] === "object") {
                    if (Array.isArray(obj[key])) {
                        if (obj[key].length === 0) {
                            delFunc(obj, key);
                        } else {
                            obj[key].forEach((elm: any, index: number) => {
                                obj[key][index] = clean(obj[key][index], delFunc);
                            });
                        }
                    } else {
                        let cleaned = clean(obj[key], delFunc);
                        if (cleaned && Object.keys(cleaned).length > 0) {
                            obj[key] = cleaned;
                        } else {
                            delFunc(obj, key);
                        }
                    }
                }
            }
        }
    }
    return obj;
}

export function getAuditTrail(fng: any, modelName: string, id: string, qry: any, callback: any) {
    if (fng.getResource(modelName)) {
        Audit.find(Object.assign(qry || {}, {
            c: modelName,
            cId: id
        })).sort({_id: -1}).exec(function (err: any, trail: Array<any>) {
            if (err) {
                callback(err);
            } else {
                async.map(trail, function (changeRec: any, mapCallback) {
                    let changedValues: Array<any> = [];
                    let changedFields = [];
                    for (let key in changeRec.chg) {
                        if (changeRec.chg.hasOwnProperty(key)) {
                            changedFields.push(key);
                        }
                    }
                    let comment: string;
                    if (changedFields.length > 0) {
                        comment = "modified " + changedFields.concat(changedValues).join(", ");
                    } else if (changeRec.op) {
                        comment = changeRec.op;
                    } else {
                        comment = 'Audit entry';
                    }
                    mapCallback(err, {
                        operation: changeRec.op,
                        user: changeRec.user,
                        changedAt: formsAngular.extractTimestampFromMongoID(changeRec._id),
                        oldVersion: changeRec.ver,
                        comment: comment
                    });
                }, callback);
            }
        });
    } else {
        callback(new Error(`No such resource as ${modelName}`));
    }
}

export function getVersion(model: any, id: any, version: string, callback: any) {
    model.findOne({_id: id}, function (err: any, latest: any) {
        if (err) {
            return callback(err, null);
        }
        Audit.find({c: model.modelName, cId: id, ver: {$gte: parseInt(version, 10)}},
            {ver: 1, chg: 1}, {sort: "-ver"}, function (err: any, histories: any) {
                if (err) {
                    console.error(err);
                    return callback(err, null);
                }
                let object = latest ? latest.toObject() : {_id: Mongoose.Types.ObjectId(id)};
                async.each(histories, function (history: any, eachCallback) {
                    (<any>jsondiffpatch).unpatch(object, history.chg);
                    eachCallback();
                }, function (err) {
                    if (err) {
                        console.error(err);
                        return callback(err, null);
                    }
                    callback(null, clean(object));
                });
            })
    });
}

function getPseudoField(name: string, updated: any, orig?: any) {
    let retVal;
    if (updated['_' + name]) {
        retVal = updated['_' + name]._id || updated['_' + name];
    } else if (orig && orig['_' + name]) {
        retVal = orig['_' + name]._id || orig['_' + name];
    } else if (orig && orig['__' + name]) {
        retVal = orig['__' + name]._id || orig['__' + name];
        delete orig['__' + name];
    }
    return retVal;
}

function auditFromObject(doc: any, orig: any, updated:any, options: AuditPluginOptions, next: any) {

    let user: any = getPseudoField('user', updated, orig);
    let op: any = getPseudoField('op', updated, orig);
    // Remove the stuff you never want to audit
    let stdOrig = clean(JSON.parse(JSON.stringify(orig)));
    let stdUpdated = clean(JSON.parse(JSON.stringify(updated)));
    let suppressedChanges = ['updatedAt','__v'];
    ['strip','hidden'].forEach((prop) => {
        if ((<any>options)[prop] && (<any>options)[prop].length > 0) {
            suppressedChanges = suppressedChanges.concat((<any>options)[prop]);
        }
    });
    suppressedChanges.forEach(attrib => {
        stripAttribFromObject(attrib, stdOrig);
        stripAttribFromObject(attrib, stdUpdated);
    });
    let chg = (<any>jsondiffpatch).diff(stdOrig, stdUpdated);
    if (chg) {
        let c: string = (<any>doc.constructor).modelName;
        let cId = doc._id;
        Audit.findOne({c: c, cId: cId, ver: {$exists: true}}).sort("-ver").exec(function (err:any, prevAudit:any) {
            if (err) {
                return next(err);
            }
            let auditRec: any = {
                c: c,
                cId: cId,
                ver: prevAudit ? prevAudit.ver + 1 : 0,
                chg: chg
            };
            if (user) {auditRec.user = user; }
            if (op) {auditRec.op = op; }
            Audit.create(auditRec, (err: Error | null) => {
                if (err) {
                    console.log(`Error creating audit object: ${err.message}`)
                }
                next()
            });
        });
    } else {
        next();
    }
}

function assignPossiblyNested(dest: any, src: any, attrib: string) {
    let srcVal;
    let cur: any;
    let tree = attrib.split('.');
    let last = tree.pop();
    if (typeof src !== "object") {
        // We are assigning a value
        srcVal = src;
    } else {
        // we are copying from an analogous object
        cur = extractPossiblyNestedPath(tree, src);
        if (cur) {
            srcVal = cur[last]
        }
    }
    if (srcVal) {
        cur = dest;
        tree.forEach(branch => {
            if (!cur[branch]) {
                cur[branch] = {};
            }
            cur = cur[branch];
        });
        cur[last] = srcVal;
    }
}

function auditFromUpdate(docUpdate: any, options: any, next: any) {
    const queryObject = docUpdate;
    const queryOp = queryObject.op;
    queryObject.find(queryObject._conditions, function (err: any, results: any) {
        if (err) {
            return next(err);
        } else {
            let original: any;
            let updated: any;
            async.eachSeries(results, function (currentObject: any, callback) {
                updated = {};
                if (['findOneAndRemove','deleteOne','findOneAndDelete'].includes(queryOp)) {
                    original = currentObject;
                } else {
                    original = {};
                    if (queryObject.options && queryObject.options._user) {original.__user = queryObject.options._user;}
                    if (queryObject.options && queryObject.options._op) {original.__op = queryObject.options._op;}
                    Object.keys(queryObject._update).forEach(key => {
                        if (key[0] === '$') {
                            Object.keys(queryObject._update[key]).forEach(attrib => {
                                if (key === '$set') {
                                    assignPossiblyNested(updated, queryObject._update.$set[attrib], attrib)
                                }
                                assignPossiblyNested(original, currentObject, attrib);
                            });
                            switch (key) {
                                case '$set':
                                    // ignore $set - already dealt with
                                    break;
                                case '$push':
                                    Object.keys(queryObject._update[key]).forEach(attrib => {
                                        updated[attrib] = [];
                                        Object.assign(updated[attrib], original[attrib]);
                                        updated[attrib].push(queryObject._update[key][attrib])
                                    });
                                    break;
                                default:
                                    let errMessage = 'No audit trail support for ' + key;
                                    if (auditOptions.errorHandler) {
                                        auditOptions.errorHandler(errMessage);
                                    } else {
                                        console.error(errMessage)
                                    }
                                    break;
                            }
                        } else {
                            // an assignment
                            assignPossiblyNested(original, currentObject, key);
                        }
                    });
                }
                auditFromObject(currentObject, original, updated, options, function() {
                    callback();
                });
            }, function done() {
                return next();
            });
        }
    });
}

function getHiddenFields(collectionName: string, options: AuditPluginOptions) {
    if (!options.hidden) {
        options.hidden = formsAngular.getResourceFromCollection(collectionName).options.hide;
    }
}

export function plugin(schema: any, options: AuditPluginOptions) {

    options = options || {};
    options.strip = options.strip || [];

    /*
            Document middleware.  "this" is the document
     */
    schema.pre("save", function (next: any) {
        if (this._noAudit) {
            next();
        } else if (this.isNew) {
            let user = getPseudoField('user', this);
            if (user) {
                let auditRec: any = {
                    c: (<any>this.constructor).modelName,
                    cId: this._id,
                    op: 'create',
                    user
                };
                Audit.create(auditRec, (err: Error | null) => {
                    if (err) {
                        console.log(`Error creating audit object: ${err.message}`)
                    }
                    next()
                });
            } else {
                next();
            }
        } else {
            let that = this;
            try {
                getHiddenFields(that.constructor.collection.collectionName, options);
                that.constructor.findOne({_id: that._id}, function(err: any, original: any) {
                    auditFromObject(that, original, that, options, next);
                });
            } catch(e) {
                if (auditOptions.errorHandler) {
                    auditOptions.errorHandler(e.message);
                }
                next();
            }
        }
    });

    schema.pre("remove", function(next: any) {
        if (this._noAudit) {
            next()
        } else {
            try {
                let that = this;
                getHiddenFields(that.constructor.collection.collectionName, options);
                auditFromObject(that, that, {}, options, next);
            } catch(e) {
                if (auditOptions.errorHandler) {
                    auditOptions.errorHandler(e.message);
                }
                next();
            }
        }
    });

    /*
            Query middleware.  "this" is the query
     */
    function doUpdateHandling() {
        return function (next: any) {
            if (this.options._noAudit) {
                next()
            } else {
                try {
                    getHiddenFields(this.mongooseCollection.collectionName, options);
                    auditFromUpdate(this, options, next);
                } catch (e) {
                    if (auditOptions.errorHandler) {
                        auditOptions.errorHandler(e.message);
                    }
                    next();
                }

            }
        };
    }

    schema.pre("findOneAndUpdate", doUpdateHandling());

    schema.pre("update", doUpdateHandling());

    schema.pre("updateOne", doUpdateHandling());

    schema.pre("updateMany", doUpdateHandling());

    schema.pre("findOneAndRemove", doUpdateHandling());

    schema.pre("deleteOne", doUpdateHandling());

    schema.pre("findOneAndDelete", doUpdateHandling());

}
