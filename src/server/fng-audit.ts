/// <reference path="../index.d.ts" />

import * as jsondiffpatch from 'jsondiffpatch/with-text-diffs';
import * as async from 'async';
import * as Mongoose from "mongoose";
import { AsyncResultCallback } from "async";
import { fngServer } from "forms-angular/dist/server/index.js";
import cloneDeep from 'lodash.clonedeep';

interface AuditOptions {
    debug?: Boolean;
    errorHandler?: (err: string) => void;
    userRef?: string;   // the collection that the "user" field links to
    // Allow the calling system to add properties to the xtra property of the audit record.  Maybe IP address or something
    addPropFunc?: (invariantAuditRec: any, doc: any, orig: any, updated: any, options: AuditPluginOptions) => any;
}

interface AuditPluginOptions {
    strip?: Array<string>
    hidden?: Array<string>
    secure?: Array<string>  // set by the plugin: every schema path marked secure: true (password hashes etc.)
}

let mongooseInstance: Mongoose.Mongoose;
let formsAngular: any;
let auditOptions: AuditOptions = {};
export let Audit: any;

export interface IAuditModel
    extends Mongoose.Model<AuditObj> { }

export const auditSchemaTypeObj = {
    c: String,   //collection
    cId: { type: Mongoose.Schema.Types.ObjectId },
    chg: {},
    user: {},  // Taken from _user or __usr
    op: String,  // Taken from _op - what operation is being performed?
    dets: {},
    ver: Number,
    xtra: { type: Mongoose.Schema.Types.Mixed },
};

export const auditSchema = new Mongoose.Schema<AuditObj>(auditSchemaTypeObj);

export function controller(fng: any, processArgs: (options: any, array: Array<any>) => Array<any>, options: AuditOptions): Partial<fngServer.IFngPlugin> {
    formsAngular = fng;
    mongooseInstance = formsAngular.mongoose;
    auditOptions = options || {};

    const modelName = 'audit';
    try {
        Audit = mongooseInstance.model<AuditObj, IAuditModel>(modelName);
    } catch (e) {
        Audit = mongooseInstance.model<AuditObj, IAuditModel>(modelName, auditSchema);
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

    // The record's own findFunc decides who may see its history: without this check anyone who can call the API
    // and knows a record's id could read the history (and, from /version/, the whole record) of one they cannot open
    function guarded(handler: (resource: any, req: any, res: any) => void) {
        return function (req: any, res: any) {
            const resource = fng.getResource(req.params.model);
            if (!resource) {
                return res.status(404).send(`No such resource as ${req.params.model}`);
            }
            recordVisible(fng, resource, req, req.params.id)
                .then((visible) => {
                    if (visible) {
                        handler(resource, req, res);
                    } else {
                        res.status(404).send(`No such record as ${req.params.id} in ${req.params.model}`);
                    }
                })
                .catch((err: Error) => {
                    res.status(500).send(err.message);
                });
        };
    }

    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/history', guarded(function (resource: any, req: any, res: any) {
        getAuditTrail(fng, req.params.model, req.params.id, {}, getCallback(res))
    })]));

    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/changes', guarded(function (resource: any, req: any, res: any) {
        getAuditTrail(fng, req.params.model, req.params.id, { chg: { $exists: true } }, getCallback(res))
    })]));

    // Maybe add fng.app.get('/:model/:id/snapshot/:date'...);

    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/version/:version', guarded(function (resource: any, req: any, res: any) {
        getVersion(resource.model, req.params.id, req.params.version, true, "bail", getCallback(res));
    })]));

    let retVal: Partial<fngServer.IFngPlugin> = {};
    if (options.userRef) {
        retVal.dependencyChecks = {
            [options.userRef]: [{
                resource: {
                    resourceName: 'audit',
                    resourceNameLower: 'audit',
                    model: Audit
                },
                keys: ['user']
            }]
        }
    }
    return retVal;
}

/**
 * Whether the user making the request may see the record's history, by the resource's findFunc (the same test the
 * record's own GET route applies).  A resource with no findFunc is open to everyone who gets past the plugin's
 * authentication, as it is for the record itself.  Otherwise the record must match the findFunc.  A record that has
 * been deleted can't be tested, so it falls back to the audit resource's own findFunc: the history is visible if the
 * user could see one of the record's audit rows.
 */
export async function recordVisible(fng: any, resource: any, req: any, id: string): Promise<boolean> {
    if (!Mongoose.isValidObjectId(id)) {
        return false;
    }
    const findFuncQuery = await fng.doFindFuncPromise(req, resource);
    if (!findFuncQuery) {
        return true;
    }
    if (await resource.model.exists({ $and: [{ _id: id }, findFuncQuery] })) {
        return true;
    }
    if (await resource.model.exists({ _id: id })) {
        // it exists, and the user may not see it
        return false;
    }
    const auditResource = fng.getResource('audit');
    if (!auditResource?.options?.findFunc) {
        return false;
    }
    const auditQuery = await fng.doFindFuncPromise(req, auditResource);
    return !!(await Audit.exists({ $and: [{ c: resource.model.modelName, cId: id }, auditQuery || {}] }));
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
    stripPathFromObject(attrib.split('.'), obj);
}

// Removes the path from obj, looking inside any arrays on the way, and coping with the shapes auditFromUpdate
// builds from update operators: keys containing dots (from $push of 'a.b') and array positions ('a.0.b', 'a.$.b')
function stripPathFromObject(tree: string[], obj: any) {
    if (!obj || typeof obj !== 'object') {
        return;
    }
    if (Array.isArray(obj)) {
        obj.forEach(elm => stripPathFromObject(tree, elm));
        return;
    }
    delete obj[tree.join('.')];
    for (let i = 1; i < tree.length; i++) {
        const key = tree.slice(0, i).join('.');
        if (key in obj) {
            stripPathFromObject(tree.slice(i), obj[key]);
        }
    }
    for (const key of Object.keys(obj)) {
        if (/^\d+$/.test(key) || key[0] === '$') {
            stripPathFromObject(tree, obj[key]);
        }
    }
}

function getSecurePaths(schema: any, prefix = ''): string[] {
    const retVal: string[] = [];
    schema.eachPath((path: string, schemaType: any) => {
        if (schemaType.options?.secure) {
            retVal.push(prefix + path);
        } else if (schemaType.schema) {
            retVal.push(...getSecurePaths(schemaType.schema, prefix + path + '.'));
        }
    });
    return retVal;
}

export function clean(obj: any, delFunc?: any): any {

    delFunc = delFunc || function (obj: any, key: any) { delete obj[key] };

    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (key === '__v') {
                delFunc(obj, key);
            } else {
                if (typeof obj[key] === "object" && !(obj[key] instanceof Date)) {
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
    if (Audit) {
        if (fng.getResource(modelName)) {
            Audit
                .find(Object.assign(qry || {}, { c: modelName, cId: id }))
                .sort({ _id: -1 })
                .exec()
                .then((trail: any[]) => {
                    async.map(trail, function (changeRec: any, mapCallback: AsyncResultCallback<IChangeRecord>) {
                        let retVal: IChangeRecord = {
                            operation: changeRec.op,
                            user: changeRec.user,
                            changedAt: fng.extractTimestampFromMongoID(changeRec._id),
                            oldVersion: changeRec.ver,
                        }
                        let changedValues: Array<any> = [];
                        let changedFields = [];
                        for (let key in changeRec.chg) {
                            if (changeRec.chg.hasOwnProperty(key)) {
                                changedFields.push(key);
                            }
                        }
                        if (changedFields.length > 0) {
                            retVal.comment = "modified " + changedFields.concat(changedValues).join(", ");
                            retVal.chg = changeRec.chg;
                            try {
                                retVal.details = describeChanges(fng.getResource(modelName)?.model?.schema, changeRec.chg);
                            } catch (e) {
                                // the raw chg is still there to fall back on
                            }
                        } else if (changeRec.op) {
                            retVal.comment = changeRec.op;
                        } else {
                            retVal.comment = 'Audit entry';
                        }
                        mapCallback(null, retVal);
                    }, callback);
                })
                .catch((err: Error) => {
                    callback(err);
                });
        } else {
            callback(new Error(`No such resource as ${modelName}`));
        }
    } else {
        // Probably a test
        callback();
    }
}

function titleCase(str: string): string {
    return str
        .replace(/(_|\.)/g, ' ')
        .replace(/[A-Z]/g, ' $&').trim()
        .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
        .replace(/\s{2,}/g, ' ');
}

// form.hidden isn't a reason to leave a field out: apps can unhide fields at run time, and the fields that are never
// sent to the client (the resource's hide option) aren't audited in the first place
function isConcealed(schemaType: any): boolean {
    return !!schemaType?.options?.secure;
}

function fieldLabel(schemaType: any, seg: string): string {
    const label = schemaType?.options?.form?.label;
    return (typeof label === 'string' && label) ? label : titleCase(seg);
}

function isPlainObject(v: any): boolean {
    return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v as any)._bsontype;
}

function refOf(schemaType: any): string | undefined {
    const ref = schemaType?.options?.ref ?? schemaType?.caster?.options?.ref ?? schemaType?.options?.type?.[0]?.ref;
    return typeof ref === 'string' ? ref : undefined;
}

function describeValueIn(value: any, schemaType: any, sch?: Mongoose.Schema, dotted?: string): IChangeValue {
    if (isPlainObject(value)) {
        const subSchema: Mongoose.Schema | undefined = schemaType?.schema;
        // a subdocument has its own schema; a nested object's fields are paths in the parent schema
        const lookup = (segs: string[]) => subSchema ? subSchema.path(segs.join('.')) : (sch && dotted ? sch.path([dotted, ...segs].join('.')) : undefined);
        const fields: IChangeValue["fields"] = [];
        const addFields = (obj: any, prefix: string[]) => {
            for (const key of Object.keys(obj)) {
                if (key === '_id' || key === '__v') { continue; }
                const segs = [...prefix, key];
                const subType: any = lookup(segs);
                if (isConcealed(subType)) { continue; }
                const v = obj[key];
                if (isPlainObject(v)) {
                    addFields(v, segs);
                } else if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) {
                    fields.push({ label: fieldLabel(subType, key), value: v, type: subType?.instance, ref: refOf(subType) });
                }
            }
        };
        addFields(value, []);
        return { fields };
    }
    return { value, type: schemaType?.instance, ref: refOf(schemaType) };
}

function decodeTextDiff(patch: string): IChangeDetail["textDiff"] {
    const result: IChangeDetail["textDiff"] = [];
    let hunks = 0;
    for (const line of patch.split('\n')) {
        if (line.startsWith('@@')) {
            if (hunks++ > 0) { result.push({ op: '=', text: ' \u2026 ' }); }
        } else if (line.length > 0) {
            const op = line[0] === '-' ? '-' : line[0] === '+' ? '+' : '=';
            let text: string;
            try { text = decodeURI(line.slice(1)); } catch (e) { text = line.slice(1); }
            const last = result[result.length - 1];
            if (last && last.op === op) { last.text += text; } else { result.push({ op, text }); }
        }
    }
    return result;
}

/**
 * Turn a jsondiffpatch delta (the chg of an audit record) into a list of field-by-field changes with labels taken
 * from the schema (form.label where there is one), so a history screen can show what changed in plain terms.
 * Secure fields are left out.
 */
export function describeChanges(schema: Mongoose.Schema | undefined, chg: any): IChangeDetail[] {
    const details: IChangeDetail[] = [];

    function leaf(delta: any[], schemaType: any, label: string, path: string, sch?: Mongoose.Schema, dotted?: string) {
        if (isConcealed(schemaType)) { return; }
        const describeValue = (v: any, t: any) => describeValueIn(v, t, sch, dotted);
        if (delta.length === 1) {
            details.push({ path, label, kind: 'added', to: describeValue(delta[0], schemaType) });
        } else if (delta.length === 2) {
            details.push({ path, label, kind: 'changed', from: describeValue(delta[0], schemaType), to: describeValue(delta[1], schemaType) });
        } else if (delta.length === 3 && delta[2] === 0) {
            details.push({ path, label, kind: 'removed', from: describeValue(delta[0], schemaType) });
        } else if (delta.length === 3 && delta[2] === 2) {
            details.push({ path, label, kind: 'text', textDiff: decodeTextDiff(delta[0]) });
        }
        // delta[2] === 3 is an array move, which isn't worth showing
    }

    function walk(delta: any, sch: Mongoose.Schema | undefined, segs: string[], labelPrefix: string, pathPrefix: string) {
        const dotted = segs.join('.');
        const schemaType: any = dotted ? sch?.path(dotted) : undefined;
        const seg = segs[segs.length - 1];
        const label = labelPrefix + fieldLabel(schemaType, seg);
        const path = pathPrefix + dotted;
        if (Array.isArray(delta)) {
            leaf(delta, schemaType, label, path, sch, dotted);
        } else if (delta && typeof delta === 'object') {
            if (delta._t === 'a') {
                if (isConcealed(schemaType)) { return; }
                const itemSchema: Mongoose.Schema | undefined = schemaType?.schema;
                const itemType = schemaType?.caster ?? schemaType;
                for (const key of Object.keys(delta)) {
                    if (key === '_t') { continue; }
                    const removed = key.startsWith('_');
                    const itemNo = parseInt(removed ? key.slice(1) : key, 10) + 1;
                    const itemLabel = `${label} #${itemNo}`;
                    const itemPath = `${path}.${itemNo}`;
                    const itemDelta = delta[key];
                    if (Array.isArray(itemDelta)) {
                        leaf(itemDelta, itemType, itemLabel, itemPath);
                    } else if (itemSchema) {
                        for (const subKey of Object.keys(itemDelta)) {
                            walk(itemDelta[subKey], itemSchema, [subKey], itemLabel + ' ', itemPath + '.');
                        }
                    }
                }
            } else if (schemaType?.schema) {
                // single nested subdocument
                if (isConcealed(schemaType)) { return; }
                for (const key of Object.keys(delta)) {
                    walk(delta[key], schemaType.schema, [key], label + ' ', path + '.');
                }
            } else {
                for (const key of Object.keys(delta)) {
                    walk(delta[key], sch, [...segs, key], labelPrefix, pathPrefix);
                }
            }
        }
    }

    if (chg && typeof chg === 'object') {
        for (const key of Object.keys(chg)) {
            walk(chg[key], schema, [key], '', '');
        }
    }
    return details;
}

function getRevision(model: any, id: any, revisionCrit: any, doCleaning: boolean, errorHandling: "bail" | "report", callback: any) {
    function reportError(obj: any, e: Error) {
        obj._errors = obj._errors || [];
        obj._errors.push(e);
    }
    if (Audit) {
        model.findOne({ _id: id })
            .then((latest: any) => {
                const criteria = { $and: [{ c: model.modelName }, { cId: id }, { chg: { $exists: true } }, revisionCrit] };
                const projection = { ver: 1, chg: 1 };
                Audit.find(criteria, projection)
                    .sort("-ver")
                    .then((histories: any) => {
                        let object = latest ? latest.toObject() : { _id: new Mongoose.Types.ObjectId(id) };
                        async.each(histories, function (history: any, eachCallback: () => void) {
                            try {
                                (<any>jsondiffpatch).unpatch(object, history.chg);
                            } catch (e) {
                                if (errorHandling === "bail") {
                                    return callback(new Error(`While unpatching ${model.modelName} ${id} version ${history.ver}: ${e.message}`), null);
                                } else {
                                    reportError(object, e);
                                }
                            }
                            eachCallback();
                        }, function (err) {
                            if (err) {
                                if (errorHandling === "bail") {
                                    return callback(err, null);
                                } else {
                                    reportError(object, err);
                                }
                            }
                            callback(null, doCleaning ? clean(object) : object);
                        });
                    })
                    .catch((err: Error) => {
                        console.error(err);
                        return callback(err, null);
                    });
            })
            .catch((err: Error) => {
                return callback(err, null);
            });
    } else {
        callback(null);
    }
}

export function getVersion(model: any, id: any, version: string, doCleaning: boolean, errorHandling: "bail" | "report", callback: any) {
    getRevision(model, id, { ver: { $gte: parseInt(version, 10) } }, doCleaning, errorHandling, callback);
}

export function getSnapshot(model: any, id: any, snapshotDt: Date, doCleaning: boolean, errorHandling: "bail" | "report", callback: any) {
    const dateAsObjectId = new Mongoose.Types.ObjectId(Math.floor(snapshotDt.getTime() / 1000).toString(16) + "0000000000000000");
    getRevision(model, id, { _id: { $gte: dateAsObjectId } }, doCleaning, errorHandling, callback);
}

export async function auditAdHocEvent(user: string, description: string, details: any) {
    function cleanKeys(obj: any) {
        if (obj && typeof obj === "object") {
            Object.keys(obj).forEach(k => {
                cleanKeys(obj[k]);
                let safeKey = k.replace(/\./g, '-').replace(/^\$/, '#')
                if (safeKey !== k) {
                    obj[safeKey] = obj[k];
                    delete obj[k];
                }
            })
        }
    }

    const copyDets = cloneDeep(details);
    cleanKeys(copyDets);    // Make sure mongoose doesn't barf on composite keys by putting quotes round them
    let auditRec = { user, op: description, dets: copyDets };
    let xtra;
    if (typeof auditOptions.addPropFunc === 'function') {
        xtra = await auditOptions.addPropFunc(auditRec, null, null, null, {});
        if (xtra) {
            (auditRec as any).xtra = xtra;
        }
    }
    return Audit.create(auditRec);
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

function auditFromObject(doc: any, orig: any, updated: any, options: AuditPluginOptions, next: (err?: Error) => void): void {
    if (Audit) {
        let user: any = getPseudoField('user', updated, orig) || getPseudoField('_usr', updated, orig);
        let op: any = getPseudoField('op', updated, orig) || orig.$op;
        // Remove the stuff you never want to audit
        let stdOrig = clean(JSON.parse(JSON.stringify(orig)));
        let stdUpdated = clean(JSON.parse(JSON.stringify(updated)));
        let suppressedChanges = ['updatedAt', '__v'];
        ['strip', 'hidden', 'secure'].forEach((prop) => {
            if ((<any>options)[prop] && (<any>options)[prop].length > 0) {
                suppressedChanges = suppressedChanges.concat((<any>options)[prop]);
            }
        });
        suppressedChanges.forEach(attrib => {
            stripAttribFromObject(attrib, stdOrig);
            stripAttribFromObject(attrib, stdUpdated);
        });
        /* check for changes in subdocuments where the original appears to be empty */
        for (const key of Object.keys(stdUpdated)) {
            if (stdUpdated[key] && stdOrig[key] === undefined && typeof stdUpdated[key] === 'object') {
                if (Array.isArray(stdUpdated[key])) {
                    stdOrig[key] = [];
                } else {
                    stdOrig[key] = {};
                }
            }
        }

        let chg = (<any>jsondiffpatch).diff(stdOrig, stdUpdated);
        if (chg) {
            let c: string = (<any>doc.constructor).modelName;
            let cId = doc._id;
            const criteria = {
                c: c,
                cId: cId,
                ver: { $exists: true }
            }
            Audit.findOne(criteria)
                .sort("-ver")
                .exec()
                .then(async (prevAudit: { ver: number }) => {
                    let auditRec: any = {
                        c: c,
                        cId: cId,
                        ver: prevAudit ? prevAudit.ver + 1 : 0,
                        chg: chg
                    };
                    if (user) {
                        auditRec.user = user;
                    }
                    if (op) {
                        auditRec.op = op;
                    }
                    if (typeof auditOptions.addPropFunc === 'function') {
                        const invariantAuditRec = { ...auditRec };
                        let xtra = await auditOptions.addPropFunc(invariantAuditRec, doc, orig, updated, options);
                        if (xtra) {
                            auditRec.xtra = xtra;
                        }
                    }
                    Audit.create(auditRec)
                        .then(() => {
                            // nothing to do
                        })
                        .catch((err: Error) => {
                            if (err) {
                                console.log(`Error creating audit object: ${err.message}`)
                            }
                        })
                        .finally(() => {
                            next()
                        })
                })
                .catch((err: Error) => {
                    return next(err);
                });
        } else {
            next();
        }
    } else {
        next();
    }
}

// Copies the value at attrib (which may be a dotted path) in src to the same path in dest
function copyPossiblyNested(dest: any, src: any, attrib: string) {
    let tree = attrib.split('.');
    let last = tree.pop();
    let cur = extractPossiblyNestedPath(tree, src);
    if (cur && cur[last] !== undefined) {
        assignPossiblyNested(dest, cur[last], attrib);
    }
}

// Sets attrib (which may be a dotted path) in dest to srcVal.  srcVal can be anything, including falsy values,
// Dates, ObjectIds, arrays and subdocuments.
function assignPossiblyNested(dest: any, srcVal: any, attrib: string) {
    let cur: any = dest;
    let tree = attrib.split('.');
    let last = tree.pop();
    tree.forEach(branch => {
        if (!cur[branch]) {
            cur[branch] = {};
        }
        cur = cur[branch];
    });
    cur[last] = srcVal;
}

function auditFromUpdate(docUpdate: any, options: any, next: any) {
    if (!Audit) {
        return next();
    } else {
        const queryObject = typeof docUpdate.clone === "function" ? docUpdate.clone() : docUpdate;
        const queryOp = queryObject.op;
        queryObject.find(queryObject._conditions)
            .then((results: any[]) => {
                let original: any;
                let updated: any;
                async.eachSeries(results, function (currentObject: any, callback) {
                    updated = {};
                    if (['findOneAndRemove', 'deleteOne', 'findOneAndDelete'].includes(queryOp)) {
                        original = currentObject;
                    } else {
                        original = {};
                        if (queryObject.options && queryObject.options._user || queryObject.options.__usr) {
                            original.__user = queryObject.options._user || queryObject.options.__usr;
                        }
                        if (queryObject.options && queryObject.options._op) {
                            original.__op = queryObject.options._op;
                        }
                        if (queryObject._update) {
                            Object.keys(queryObject._update).forEach(key => {
                                if (key[0] === '$') {
                                    Object.keys(queryObject._update[key]).forEach(attrib => {
                                        if (key === '$set') {
                                            assignPossiblyNested(updated, queryObject._update.$set[attrib], attrib)
                                        }
                                        copyPossiblyNested(original, currentObject, attrib);
                                    });
                                    switch (key) {
                                        case '$set':
                                        case '$unset':
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
                                    copyPossiblyNested(original, currentObject, key);
                                }
                            });
                        }
                    }
                    auditFromObject(currentObject, original, updated, options, function () {
                        callback();
                    });
                }, function done() {
                    return next();
                });
            })
            .catch((err: Error) => {
                return next(err);
            });
    }
}

function getHiddenFields(collectionName: string, options: AuditPluginOptions) {
    if (!options.hidden) {
        // TODO: there is a problem here when doUpdateHandling has the collection name rather than the fng entity name
        // Just using optional chaining for now
        options.hidden = formsAngular?.getResourceFromCollection(collectionName)?.options?.hide;
    }
}

export function getUpdatesSince(modelName: string, id: Mongoose.Types.ObjectId, since: Date): Promise<AuditObj[]> {
    let crit: any = { c: modelName, cId: id, ver: { $exists: true } };
    if (since) {
        crit._id = { $gt: new Mongoose.Types.ObjectId(Math.floor(since.getTime() / 1000).toString(16) + "0000000000000000") };
        return Audit.find(crit).lean();
    } else {
        return Audit.find(crit).sort({ _id: -1 }).limit(1).lean();
    }
}

export function plugin(schema: any, options: AuditPluginOptions) {

    options = options || {};
    options.strip = options.strip || [];

    // Worked out on first use rather than now, so paths added to the schema after this plugin are included
    function getStrippedFields(collectionName: string) {
        getHiddenFields(collectionName, options);
        if (!options.secure) {
            options.secure = getSecurePaths(schema);
        }
    }

    /*
            Document middleware.  "this" is the document
     */
    schema.pre("save", function (next: any) {
        function doTheCreate(theAuditRec: any) {
            Audit.create(theAuditRec)
                .then(() => {
                    // nothing to do
                })
                .catch((err: Error) => {
                    console.log(`Error creating audit object: ${err.message}`)
                })
                .finally(() => {
                    next()
                });
        }

        if (this._noAudit || !Audit) {
            next();
        } else if (this.isNew) {
            // No point in auditing if we don't have a user, as the document itself does the job
            let user = getPseudoField('user', this) || getPseudoField('_usr', this);
            if (user) {
                let auditRec: any = {
                    c: (<any>this.constructor).modelName,
                    cId: this._id,
                    op: 'create',
                    user
                };
                if (typeof auditOptions.addPropFunc === "function") {
                    auditOptions.addPropFunc(auditRec, this, null, null, {})
                        .then((xtra: any) => {
                            if (xtra) {
                                (auditRec as any).xtra = xtra;
                            }
                            doTheCreate(auditRec);
                        });
                } else {
                    doTheCreate(auditRec);
                }
            } else {
                next();
            }
        } else {
            let that = this;
            try {
                getStrippedFields(that.constructor.collection.collectionName);
                that.constructor.findOne({ _id: that._id })
                    .then((original: any) => {
                        auditFromObject(that, original, that, options, next);
                    })
                    .catch((err: Error) => {
                        if (auditOptions.errorHandler) {
                            auditOptions.errorHandler(err.message);
                        }
                        next();
                    })
            } catch (e) {
                if (auditOptions.errorHandler) {
                    auditOptions.errorHandler(e.message);
                }
                next();
            }
        }
    });

    // prior to mongoose 7, pre("remove") was used to intercept deleted documents.  in mongoose 7, remove() no longer
    // exists, and instead, deleteOne() is used both to delete a document that has already been retrieved from the
    // collection (i.e., doc.deleteOne()) and to delete a single document using a query (i.e., model.deleteOne({criteria})).
    // to distinguish between these two cases in middleware (because obviously one has a document, and the other
    // just the query conditions), we need to specify here whether we're dealing with the document case, the
    // query case, or both.
    // the document case is dealt with here, the query case, below (see schema.pre("deleteOne", ...) again, later)
    schema.pre("deleteOne", { document: true, query: false }, function (next: any) {
        if (this._noAudit || !Audit) {
            next()
        } else {
            try {
                let that = this;
                getStrippedFields(that.constructor.collection.collectionName);
                auditFromObject(that, that, {}, options, next);
            } catch (e) {
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
            if (this.options._noAudit || !Audit) {
                next()
            } else {
                try {
                    getStrippedFields(this.mongooseCollection.collectionName);
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

    schema.methods.saveNoAudit = function <T extends Mongoose.Document & { _noAudit?: boolean }>(this: T, options?: Mongoose.SaveOptions): Promise<T> {
        this._noAudit = true;
        return this.save(options).then(() => {
            this._noAudit = false;
            return this;
        });
    };

    schema.methods.deleteNoAudit = function <T extends Mongoose.Document & { _noAudit?: boolean }>(this: T): Promise<T> {
        this._noAudit = true;
        if (this.deleteOne) {
            return this.deleteOne();
        } else if ((this as any).remove) {
            return (this as any).remove();
        } else {
            throw new Error("Don't know how to delete a document with this version of Mongoose");
        }
    };

    schema.pre("findOneAndUpdate", doUpdateHandling());

    schema.pre("update", doUpdateHandling());

    schema.pre("updateOne", doUpdateHandling());

    schema.pre("updateMany", doUpdateHandling());

    schema.pre("findOneAndRemove", doUpdateHandling());

    schema.pre("deleteOne", { document: false, query: true }, doUpdateHandling());

    schema.pre("findOneAndDelete", doUpdateHandling());

}

export default {
    describeChanges,
    get Audit() { return Audit; },

    auditSchemaTypeObj,
    auditSchema,
    controller,
    clean,
    getAuditTrail,
    recordVisible,
    getVersion,
    getSnapshot,
    auditAdHocEvent,
    getUpdatesSince,
    plugin
};

