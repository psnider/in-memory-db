"use strict";
// import mongoose = require('mongoose')
// mongoose.Promise = Promise
var pino = require('pino');
var HTTP_STATUS = require('http-status-codes');
var log = pino({ name: 'people-db', enabled: !process.env.DISABLE_LOGGING });
function cloneObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    var temp = obj.constructor(); // give temp the original obj's constructor
    for (var key in obj) {
        temp[key] = cloneObject(obj[key]);
    }
    return temp;
}
function newError(msg, status) {
    var error = new Error(msg);
    error['http_status'] = status;
    return error;
}
exports.UNSUPPORTED_UPDATE_CMDS = {
    object: {
        set: false,
        unset: true
    },
    array: {
        set: true,
        unset: true,
        insert: true,
        remove: true
    }
};
var InMemoryDB = (function () {
    function InMemoryDB(_id, typename) {
        this.next_id = 1;
        this.connected = false;
        this.index = {};
    }
    // returns an ID that is 24 character longs, but not hexadecimal
    InMemoryDB.prototype.createObjectId = function () {
        // assume won't overflow 99999999999 because that's too many for memory!
        var n = this.next_id.toString();
        ++this.next_id;
        var len = n.length;
        // use an ID that is incompatible with mongo,
        // to help catch cross contamination
        var id = 'in-memory-db ' + ('00000000000' + n).slice(len);
        return id;
    };
    InMemoryDB.prototype.isInIndex = function (_id) {
        return (this.index[_id] != null);
    };
    InMemoryDB.prototype.getFromIndex = function (_id) {
        if (_id == null) {
            throw new Error('getFromIndex: _id is unset');
        }
        return this.index[_id];
    };
    InMemoryDB.prototype.cloneFromIndex = function (_id) {
        if (_id == null) {
            throw new Error('cloneFromIndex: _id is unset');
        }
        var obj = this.index[_id];
        var cloned = cloneObject(obj);
        return cloned;
    };
    InMemoryDB.prototype.addToIndex = function (obj) {
        if (obj._id == null) {
            throw new Error('addToIndex: obj._id is unset');
        }
        if (this.index[obj._id]) {
            log.warn("overwriting object in index with _id=" + obj._id);
        }
        this.index[obj._id] = cloneObject(obj);
    };
    InMemoryDB.prototype.deleteFromIndex = function (_id) {
        var obj = this.index[_id];
        if (obj) {
            delete this.index[_id];
        }
    };
    // TODO: REPAIR: connect(done?: ErrorOnlyCallback): Promise<void> | void {
    InMemoryDB.prototype.connect = function (done) {
        this.connected = true;
        if (done) {
            done();
        }
        else {
            return Promise.resolve();
        }
    };
    // TODO: REPAIR: disconnect(done?: ErrorOnlyCallback): Promise<void> | void {
    InMemoryDB.prototype.disconnect = function (done) {
        this.connected = false;
        if (done) {
            done();
        }
        else {
            return Promise.resolve();
        }
    };
    // create(obj: T): Promise<T>
    // create(obj: T, done: CreateCallback<T>): void
    InMemoryDB.prototype.create = function (obj, done) {
        if (done) {
            if (this.connected) {
                if (obj['_id'] == null) {
                    var cloned_obj = cloneObject(obj);
                    cloned_obj._id = this.createObjectId();
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
    };
    InMemoryDB.prototype.promisify_create = function (value) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.create(value, function (error, result) {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    };
    // read(_id : string) : Promise<T>
    // read(_id : string, done: ReadCallback<T>) : void
    InMemoryDB.prototype.read = function (_id, done) {
        if (done) {
            if (this.connected) {
                if (_id) {
                    var obj = this.cloneFromIndex(_id);
                    done(undefined, obj);
                }
                else {
                    done(new Error('_id is invalid'));
                }
            }
            else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR);
                done(error);
            }
        }
        else {
            return this.promisify_read(_id);
        }
    };
    InMemoryDB.prototype.promisify_read = function (_id) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.read(_id, function (error, result) {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    };
    // replace(obj: T) : Promise<T>
    // replace(obj: T, done: ReplaceCallback<T>) : void
    InMemoryDB.prototype.replace = function (obj, done) {
        if (done) {
            if (this.connected) {
                if (this.isInIndex(obj._id)) {
                    // the returned object is different from both the object saved, and the one provided
                    this.addToIndex(obj);
                    done(undefined, this.cloneFromIndex(obj._id));
                }
                else {
                    done(newError("_id is invalid", HTTP_STATUS.BAD_REQUEST));
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
    };
    InMemoryDB.prototype.promisify_replace = function (obj) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.replace(obj, function (error, result) {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    };
    // update(conditions : Conditions, updates: UpdateFieldCommand[], getOriginalDocument?: GetOriginalDocumentCallback<T>) : Promise<T>
    // update(conditions : Conditions, updates: UpdateFieldCommand[], getOriginalDocument: GetOriginalDocumentCallback<T>, done: UpdateSingleCallback<T>) : void
    InMemoryDB.prototype.update = function (conditions, updates, done) {
        if (done) {
            if (this.connected) {
                var _id = conditions['_id'];
                var obj = this.getFromIndex(_id);
                if (obj) {
                    if (updates.length !== 1)
                        throw new Error('update only supports one UpdateFieldCommand at a time');
                    var update = updates[0];
                    if (update.cmd !== 'set')
                        throw new Error('update only supports UpdateFieldCommand.cmd==set');
                    obj[update.field] = update.value;
                    done(undefined, this.cloneFromIndex(_id));
                }
                else {
                    done(newError("_id is invalid", HTTP_STATUS.BAD_REQUEST));
                }
            }
            else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR);
                done(error);
            }
        }
        else {
            return this.promisify_update(conditions, updates);
        }
    };
    InMemoryDB.prototype.promisify_update = function (conditions, updates) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.update(conditions, updates, function (error, result) {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    };
    // del(conditions : Conditions, getOriginalDocument?: (doc : T) => void) : Promise<void>
    // del(conditions : Conditions, getOriginalDocument: (doc : T) => void, done: DeleteSingleCallback) : void
    InMemoryDB.prototype.del = function (_id, done) {
        if (done) {
            if (this.connected) {
                if (_id != null) {
                    this.deleteFromIndex(_id);
                    done();
                }
                else {
                    done(newError("_id is invalid", HTTP_STATUS.BAD_REQUEST));
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
    };
    InMemoryDB.prototype.promisify_del = function (_id) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.del(_id, function (error) {
                if (!error) {
                    resolve();
                }
                else {
                    reject(error);
                }
            });
        });
    };
    // find(conditions : Conditions, fields?: Fields, sort?: Sort, cursor?: Cursor) : Promise<T[]> 
    // find(conditions : Conditions, fields: Fields, sort: Sort, cursor: Cursor, done: FindCallback<T>) : void
    InMemoryDB.prototype.find = function (conditions, fields, sort, cursor, done) {
        var _this = this;
        if (done) {
            if (this.connected) {
                var matching_ids = [];
                if (conditions) {
                    if (Object.keys(conditions).length != 1) {
                        done(new Error());
                        return;
                    }
                    var query_field = Object.keys(conditions)[0];
                    var query_value = conditions[query_field];
                    for (var _id in this.index) {
                        var value = this.getFromIndex(_id);
                        if (value[query_field] === query_value) {
                            matching_ids.push(_id);
                        }
                    }
                }
                else {
                    matching_ids = Object.keys(this.index);
                }
                var start = (cursor && cursor.start_offset) ? cursor.start_offset : 0;
                var count = (cursor && cursor.count) ? cursor.count : 10;
                var sliced_matching_ids = matching_ids.slice(start, start + count);
                var results = sliced_matching_ids.map(function (_id) { return _this.cloneFromIndex(_id); });
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
    };
    InMemoryDB.prototype.promisify_find = function (conditions, fields, sort, cursor) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.find(conditions, fields, sort, cursor, function (error, result) {
                if (!error) {
                    resolve(result);
                }
                else {
                    reject(error);
                }
            });
        });
    };
    return InMemoryDB;
}());
exports.InMemoryDB = InMemoryDB;
