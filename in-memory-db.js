"use strict";
// import mongoose = require('mongoose')
// mongoose.Promise = Promise
const pino = require('pino');
const HTTP_STATUS = require('http-status-codes');
var log = pino({ name: 'in-memory-db', enabled: !process.env.DISABLE_LOGGING });
function cloneObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    var temp;
    if (obj instanceof Date) {
        temp = new Date(obj);
    }
    else {
        temp = obj.constructor(); // create new obj from original obj's constructor
        for (var key in obj) {
            temp[key] = cloneObject(obj[key]);
        }
    }
    return temp;
}
function newError(msg, status) {
    let error = new Error(msg);
    error['http_status'] = status;
    return error;
}
exports.SUPPORTED_FEATURES = {
    replace: true,
    update: {
        object: {
            set: true,
            unset: true
        },
        array: {
            set: true,
            unset: true,
            insert: true,
            remove: true
        }
    },
    find: {
        all: true
    }
};
class InMemoryDB {
    constructor() {
        this.next_id = 1;
        this.connected = false;
        this.index = {};
    }
    // returns an ID that is 24 character longs, but not hexadecimal
    createObjectId() {
        // assume won't overflow 99999999999 because that's too many for memory!
        var n = this.next_id.toString();
        ++this.next_id;
        var len = n.length;
        // use an ID that is incompatible with mongo,
        // to help catch cross contamination
        var id = 'in-memory-db ' + ('00000000000' + n).slice(len);
        return id;
    }
    isInIndex(_id) {
        return (this.index[_id] != null);
    }
    getFromIndex(_id) {
        if (_id == null) {
            throw new Error('getFromIndex: _id is unset');
        }
        return this.index[_id];
    }
    cloneFromIndex(_id) {
        if (_id == null) {
            throw new Error('cloneFromIndex: _id is unset');
        }
        var obj = this.index[_id];
        var cloned = cloneObject(obj);
        return cloned;
    }
    addToIndex(obj) {
        if (obj._id == null) {
            throw new Error('addToIndex: obj._id is unset');
        }
        if (this.index[obj._id]) {
            log.warn(`overwriting object in index with _id=${obj._id}`);
        }
        this.index[obj._id] = cloneObject(obj);
    }
    deleteFromIndex(_id) {
        var obj = this.index[_id];
        if (obj) {
            delete this.index[_id];
        }
    }
    connect(done) {
        this.connected = true;
        if (done) {
            done();
        }
        else {
            return Promise.resolve();
        }
    }
    disconnect(done) {
        this.connected = false;
        if (done) {
            done();
        }
        else {
            return Promise.resolve();
        }
    }
    create(obj, done) {
        if (done) {
            if (this.connected) {
                if (obj['_id'] == null) {
                    var cloned_obj = cloneObject(obj);
                    cloned_obj._id = this.createObjectId();
                    cloned_obj._obj_ver = 1;
                    this.addToIndex(cloned_obj);
                    done(undefined, cloned_obj);
                }
                else {
                    var error = newError('_id isnt allowed for create', HTTP_STATUS.BAD_REQUEST);
                    done(error);
                }
            }
            else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR);
                done(error);
            }
        }
        else {
            return this.promisify_create(obj);
        }
    }
    promisify_create(value) {
        return new Promise((resolve, reject) => {
            this.create(value, (error, result) => {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    }
    read(_id_or_ids, done) {
        if (done) {
            if (Array.isArray(_id_or_ids)) {
                var _ids = _id_or_ids;
            }
            else if ((typeof _id_or_ids === 'string') && (_id_or_ids.length > 0)) {
                var _id = _id_or_ids;
            }
            if (this.connected) {
                if (_id) {
                    var obj = this.cloneFromIndex(_id);
                    done(undefined, obj);
                }
                else if (_ids) {
                    let results = [];
                    _ids.forEach((_id) => {
                        var obj = this.cloneFromIndex(_id);
                        if (obj) {
                            results.push(obj);
                        }
                    });
                    done(undefined, results);
                }
                else {
                    done(new Error('_id_or_ids is invalid'));
                }
            }
            else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR);
                done(error);
            }
        }
        else {
            // TODO: resolve this typing problem
            //  [resolve type declarations for overloaded methods](https://github.com/psnider/in-memory-db/issues/1)
            return this.promisify_read(_id_or_ids);
        }
    }
    promisify_read(_id_or_ids) {
        return new Promise((resolve, reject) => {
            // TODO: resolve this typing problem
            //  [resolve type declarations for overloaded methods](https://github.com/psnider/in-memory-db/issues/1)
            this.read(_id_or_ids, (error, result) => {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    }
    replace(obj, done) {
        if (done) {
            if (this.connected) {
                if (this.isInIndex(obj._id)) {
                    let original_obj = this.getFromIndex(obj._id);
                    if (obj._obj_ver === original_obj._obj_ver) {
                        // the returned object is different from both the object saved, and the one provided
                        this.addToIndex(obj);
                        let cloned_obj = this.cloneFromIndex(obj._id);
                        cloned_obj._obj_ver++;
                        done(undefined, cloned_obj);
                    }
                    else {
                        done(newError(`replace refused due to intermediate update`, HTTP_STATUS.CONFLICT));
                    }
                }
                else {
                    done(newError(`_id is invalid`, HTTP_STATUS.BAD_REQUEST));
                }
            }
            else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR);
                done(error);
            }
        }
        else {
            return this.promisify_replace(obj);
        }
    }
    promisify_replace(obj) {
        return new Promise((resolve, reject) => {
            this.replace(obj, (error, result) => {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    }
    performUpdates(obj, updates) {
        return new Promise((resolve, reject) => {
            for (let i = 0; i < updates.length; ++i) {
                let update = updates[i];
                if (update.field.includes('.'))
                    throw new Error('update only supports top-level fields');
                let field = obj[update.field];
                switch (update.cmd) {
                    case 'set':
                        if (Array.isArray(field)) {
                            let i = field.findIndex((element) => { return element === update.element_id; });
                            if (i > -1) {
                                field[i] = update.value;
                                resolve(obj);
                            }
                            else {
                                reject(new Error(`array element not found`));
                            }
                        }
                        else {
                            obj[update.field] = update.value;
                            resolve(obj);
                        }
                        break;
                    case 'unset':
                        if (Array.isArray(field)) {
                            let i = field.findIndex((element) => { return element === update.value; });
                            if (i > -1) {
                                field.splice(i, 1);
                                resolve(obj);
                            }
                            else {
                                reject(new Error(`cmd=unset not allowed on array without a subfield, use cmd=remove`));
                            }
                        }
                        else {
                            obj[update.field] = undefined;
                            resolve(obj);
                        }
                        break;
                    case 'insert':
                        obj[update.field].push(update.value);
                        resolve(obj);
                        break;
                    case 'remove':
                        if (Array.isArray(field)) {
                            let i = field.findIndex((element) => { return element === update.element_id; });
                            if (i > -1) {
                                field.splice(i, 1);
                                resolve(obj);
                            }
                            else {
                                reject(new Error(`couldnt find matching element`));
                            }
                        }
                        else {
                            reject(new Error(`cmd=remove only allowed on arrays`));
                        }
                        break;
                    default:
                        reject(new Error(`update does not support UpdateFieldCommand.cmd=${update.cmd}`));
                }
            }
        });
    }
    update(_id, _obj_ver, updates, done) {
        if (done) {
            if (this.connected) {
                var stored_obj = this.cloneFromIndex(_id);
                if (stored_obj) {
                    if (_obj_ver === stored_obj._obj_ver) {
                        this.performUpdates(stored_obj, updates).then((updated_obj) => {
                            updated_obj._obj_ver++;
                            this.addToIndex(updated_obj);
                            done(undefined, this.cloneFromIndex(_id));
                        }).catch((error) => {
                            done(error);
                        });
                    }
                    else {
                        done(newError(`update refused due to intermediate update`, HTTP_STATUS.CONFLICT));
                    }
                }
                else {
                    done(newError(`_id is invalid`, HTTP_STATUS.BAD_REQUEST));
                }
            }
            else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR);
                done(error);
            }
        }
        else {
            return this.promisify_update(_id, _obj_ver, updates);
        }
    }
    promisify_update(_id, _obj_ver, updates) {
        return new Promise((resolve, reject) => {
            this.update(_id, _obj_ver, updates, (error, result) => {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    }
    del(_id, done) {
        if (done) {
            if (this.connected) {
                if (_id != null) {
                    this.deleteFromIndex(_id);
                    done();
                }
                else {
                    done(newError(`_id is invalid`, HTTP_STATUS.BAD_REQUEST));
                }
            }
            else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR);
                done(error);
            }
        }
        else {
            return this.promisify_del(_id);
        }
    }
    promisify_del(_id) {
        return new Promise((resolve, reject) => {
            this.del(_id, (error) => {
                if (!error) {
                    resolve();
                }
                else {
                    reject(error);
                }
            });
        });
    }
    find(conditions, fields, sort, cursor, done) {
        if (done) {
            if (this.connected) {
                let matching_ids = [];
                if (conditions) {
                    if (Object.keys(conditions).length != 1) {
                        done(new Error());
                        return;
                    }
                    let query_field = Object.keys(conditions)[0];
                    let query_value = conditions[query_field];
                    for (var _id in this.index) {
                        let value = this.getFromIndex(_id);
                        if (value[query_field] === query_value) {
                            matching_ids.push(_id);
                        }
                    }
                }
                else {
                    matching_ids = Object.keys(this.index);
                }
                let start = (cursor && cursor.start_offset) ? cursor.start_offset : 0;
                let count = (cursor && cursor.count) ? cursor.count : 10;
                var sliced_matching_ids = matching_ids.slice(start, start + count);
                let results = sliced_matching_ids.map((_id) => { return this.cloneFromIndex(_id); });
                done(undefined, results);
            }
            else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR);
                done(error);
            }
        }
        else {
            return this.promisify_find(conditions, fields, sort, cursor);
        }
    }
    promisify_find(conditions, fields, sort, cursor) {
        return new Promise((resolve, reject) => {
            this.find(conditions, fields, sort, cursor, (error, result) => {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    }
}
exports.InMemoryDB = InMemoryDB;
