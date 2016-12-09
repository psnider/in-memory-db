// import mongoose = require('mongoose')
// mongoose.Promise = Promise
import pino = require('pino')
import HTTP_STATUS = require('http-status-codes')

import configure = require('@sabbatical/configure-local')
import {ArrayCallback, Conditions, Cursor, DocumentID, DocumentBase, DocumentDatabase, ErrorOnlyCallback, Fields, ObjectCallback, ObjectOrArrayCallback, Sort, UpdateFieldCommand} from '@sabbatical/document-database'
import {UnsupportedUpdateCmds} from '@sabbatical/document-database/tests'

type DataType = DocumentBase


var log = pino({name: 'people-db', enabled: !process.env.DISABLE_LOGGING})


function cloneObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }
    var temp = obj.constructor() // give temp the original obj's constructor
    for (var key in obj) {
        temp[key] = cloneObject(obj[key])
    }
    return temp
}


function newError(msg, status) {
    let error = new Error(msg)
    error['http_status'] = status
    return error
}


export var UNSUPPORTED_UPDATE_CMDS: UnsupportedUpdateCmds = {
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
}


export class InMemoryDB implements DocumentDatabase {

    next_id: number
    connected: boolean
    index: {[_id:string]: DataType}
    

    constructor(_id: string, typename: string) {
        this.next_id = 1
        this.connected = false
        this.index = {}
    }


    // returns an ID that is 24 character longs, but not hexadecimal
    createObjectId(): string {
        // assume won't overflow 99999999999 because that's too many for memory!
        var n = this.next_id.toString()
        ++this.next_id
        var len = n.length
        // use an ID that is incompatible with mongo,
        // to help catch cross contamination
        var id = 'in-memory-db ' + ('00000000000' + n).slice(len)
        return id
    }


    isInIndex(_id) {
        return (this.index[_id] != null)
    }


    getFromIndex(_id) {
        if (_id == null) {
            throw new Error('getFromIndex: _id is unset')
        }
        return this.index[_id]
    }


    cloneFromIndex(_id) {
        if (_id == null) {
            throw new Error('cloneFromIndex: _id is unset')
        }
        var obj = this.index[_id]
        var cloned = cloneObject(obj)
        return cloned
    }


    addToIndex(obj) {
        if (obj._id == null) {
            throw new Error('addToIndex: obj._id is unset')
        }
        if (this.index[obj._id]) {
            log.warn(`overwriting object in index with _id=${obj._id}`)
        }
        this.index[obj._id] = cloneObject(obj)
    }


    deleteFromIndex(_id) {
        var obj = this.index[_id]
        if (obj) {
            delete this.index[_id]
        }
    }


    // TODO: REPAIR: connect(done?: ErrorOnlyCallback): Promise<void> | void {
    connect(done?: ErrorOnlyCallback): any {
        this.connected = true
        if (done) {
            done()
        } else {
            return Promise.resolve()
        }
    }


    // TODO: REPAIR: disconnect(done?: ErrorOnlyCallback): Promise<void> | void {
    disconnect(done?: ErrorOnlyCallback): any {
        this.connected = false
        if (done) {
            done()
        } else {
            return Promise.resolve()
        }
    }


    create(obj: DataType): Promise<DataType>
    create(obj: DataType, done: ObjectCallback): void
    create(obj: DataType, done?: ObjectCallback): Promise<DataType> | void {
        if (done) {
            if (this.connected) {
                if (obj['_id'] == null) {
                    var cloned_obj = cloneObject(obj)
                    cloned_obj._id = this.createObjectId()
                    this.addToIndex(cloned_obj)
                    done(undefined, cloned_obj)
                } else {
                    var error = newError('_id isnt allowed for create', HTTP_STATUS.BAD_REQUEST)
                    done(error)
                }
            } else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR)
                done(error)
            }
        } else {
            return this.promisify_create(obj)
        }
    }

    promisify_create(value: DataType): Promise<DataType> {
        return new Promise((resolve, reject) => {
            this.create(value, (error, result) => {
                if (!error) {
                    resolve(result)
                } else {
                    reject(error)
                }
            })
        })
    }


    read(_id: DocumentID): Promise<DataType>
    read(_id: DocumentID, done: ObjectCallback): void
    read(_ids: DocumentID[]): Promise<DataType[]> 
    read(_ids: DocumentID[], done: ArrayCallback): void
    read(_id_or_ids: DocumentID | DocumentID[], done?: ObjectOrArrayCallback): Promise<DataType | DataType[]> | void {
        if (done) {
            if (Array.isArray(_id_or_ids)) {
                var _ids = <DocumentID[]>_id_or_ids
            } else if ((typeof _id_or_ids === 'string') && (_id_or_ids.length > 0)){
                var _id = <DocumentID>_id_or_ids
            }
            if (this.connected) {
                if (_id) {
                    var obj = this.cloneFromIndex(_id)
                    done(undefined, obj)
                } else if (_ids) {
                    let results = []
                    _ids.forEach((_id) => {
                        var obj = this.cloneFromIndex(_id)
                        if (obj) {
                            results.push(obj)
                        }
                    })
                    done(undefined, results)
                } else {
                    done(new Error ('_id_or_ids is invalid'))
                }
            } else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR)
                done(error)
            }
        } else {
            // TODO: resolve this typing problem
            return this.promisify_read(<any>_id_or_ids)
        }
    }


    promisify_read(_id: DocumentID): Promise<DataType>
    promisify_read(_ids: DocumentID[]) : Promise<DataType[]> 
    promisify_read(_id_or_ids: DocumentID | DocumentID[]): Promise<DataType | DataType[]> {
        return new Promise((resolve, reject) => {
            // TODO: resolve this typing problem
            this.read(<any>_id_or_ids, (error, result) => {
                if (!error) {
                    resolve(result)
                } else {
                    reject(error)
                }
            })
        })
    }


    replace(obj: DataType): Promise<DataType>
    replace(obj: DataType, done: ObjectCallback): void
    replace(obj: DataType, done?: ObjectCallback): Promise<DataType> | void {
        if (done) {
            if (this.connected) {
                if (this.isInIndex(obj._id)) {
                    // the returned object is different from both the object saved, and the one provided
                    this.addToIndex(obj)
                    done(undefined, this.cloneFromIndex(obj._id))
                } else {
                    done(newError(`_id is invalid`, HTTP_STATUS.BAD_REQUEST))
                }
            } else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR)
                done(error)
            }
        } else {
            return this.promisify_replace(obj)
        }
    }


    promisify_replace(obj: DataType): Promise<DataType> {
        return new Promise((resolve, reject) => {
            this.replace(obj, (error, result) => {
                if (!error) {
                    resolve(result)
                } else {
                    reject(error)
                }
            })
        })
    }


    update(conditions: Conditions, updates: UpdateFieldCommand[]): Promise<DataType>
    update(conditions: Conditions, updates: UpdateFieldCommand[], done: ObjectCallback): void
    update(conditions: Conditions, updates: UpdateFieldCommand[], done?: ObjectCallback): Promise<DataType> | void {
        if (done) {
            if (this.connected) {
                let _id = conditions['_id']
                var obj = this.getFromIndex(_id)
                if (obj) {
                    if (updates.length !== 1) throw new Error('update only supports one UpdateFieldCommand at a time')
                    let update = updates[0]
                    if (update.cmd !== 'set') throw new Error('update only supports UpdateFieldCommand.cmd==set')
                    obj[update.field] = update.value
                    done(undefined, this.cloneFromIndex(_id))
                } else {
                    done(newError(`_id is invalid`, HTTP_STATUS.BAD_REQUEST))
                }
            } else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR)
                done(error)
            }
        } else {
            return this.promisify_update(conditions, updates)
        }
    }


    promisify_update(conditions: Conditions, updates: UpdateFieldCommand[]): Promise<DataType> {
        return new Promise((resolve, reject) => {
            this.update(conditions, updates, (error, result) => {
                if (!error) {
                    resolve(result)
                } else {
                    reject(error)
                }
            })
        })
    }


    del(_id: DocumentID): Promise<void>
    del(_id: DocumentID, done: ErrorOnlyCallback): void
    del(_id: DocumentID, done?: ErrorOnlyCallback): Promise<void> | void {
        if (done) {
            if (this.connected) {
                if (_id != null) {
                    this.deleteFromIndex(_id)
                    done()
                } else {
                    done(newError(`_id is invalid`, HTTP_STATUS.BAD_REQUEST))
                }
            } else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR)
                done(error)
            }
        } else {
            return this.promisify_del(_id)
        }
    }


    promisify_del(_id: DocumentID): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.del(_id, (error) => {
                if (!error) {
                    resolve()
                } else {
                    reject(error)
                }
            })
        })
    }



    find(conditions: Conditions, fields: Fields, sort: Sort, cursor: Cursor): Promise<DataType[]> 
    find(conditions: Conditions, fields: Fields, sort: Sort, cursor: Cursor, done: ArrayCallback): void
    find(conditions: Conditions, fields: Fields, sort: Sort, cursor: Cursor, done?: ArrayCallback): Promise<DataType[]> | void {
        if (done) {
            if (this.connected) {
                let matching_ids = []
                if (conditions) {
                    if (Object.keys(conditions).length != 1) {
                        done(new Error())
                        return
                    }
                    let query_field = Object.keys(conditions)[0]
                    let query_value = conditions[query_field]
                    for (var _id in this.index) {
                        let value = this.getFromIndex(_id)
                        if (value[query_field] === query_value) {
                            matching_ids.push(_id)
                        }
                    }
                } else {
                    matching_ids = Object.keys(this.index)
                }
                let start = (cursor && cursor.start_offset) ? cursor.start_offset : 0
                let count = (cursor && cursor.count) ? cursor.count : 10
                var sliced_matching_ids = matching_ids.slice(start, start + count)
                let results = sliced_matching_ids.map((_id) => {return this.cloneFromIndex(_id)})
                done(undefined, results)
            } else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR)
                done(error)
            }
        } else {
            return this.promisify_find(conditions, fields, sort, cursor)
        }
    }


    promisify_find(conditions: Conditions, fields: Fields, sort: Sort, cursor): Promise<DataType[]> {
        return new Promise<DataType[]>((resolve, reject) => {
            this.find(conditions, fields, sort, cursor, (error, result) => {
                if (!error) {
                    resolve(result)
                } else {
                    reject(error)
                }
            })
        })
    }

}


