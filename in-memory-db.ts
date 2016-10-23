// import mongoose = require('mongoose')
// mongoose.Promise = Promise
import pino = require('pino')
import HTTP_STATUS = require('http-status-codes')

import configure = require('configure-local')
import {ArrayCallback, Conditions, Cursor, DocumentID, DocumentBase, DocumentDatabase, ErrorOnlyCallback, Fields, ObjectCallback, ObjectOrArrayCallback, Sort, UpdateFieldCommand} from 'document-database-if'

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


export class InMemoryDB<DataType extends DocumentBase> implements DocumentDatabase<DataType> {

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


    // create(obj: T): Promise<T>
    // create(obj: T, done: CreateCallback<T>): void
    create(obj: DataType, done?: ObjectCallback<DataType>): any {
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


    // read(_id : string) : Promise<T>
    // read(_id : string, done: ReadCallback<T>) : void
    read(_id: DocumentID, done?: ObjectCallback<DataType>): any {
        if (done) {
            if (this.connected) {
                if (_id) {
                    var obj = this.cloneFromIndex(_id)
                    done(undefined, obj)
                } else {
                    done(new Error ('_id is invalid'))
                }
            } else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR)
                done(error)
            }
        } else {
            return this.promisify_read(_id)
        }
    }


    promisify_read(_id: DocumentID): Promise<DataType> {
        return new Promise((resolve, reject) => {
            this.read(_id, (error, result) => {
                if (!error) {
                    resolve(result)
                } else {
                    reject(error)
                }
            })
        })
    }


    // replace(obj: T) : Promise<T>
    // replace(obj: T, done: ReplaceCallback<T>) : void
    replace(obj: DataType, done?: ObjectCallback<DataType>): any {
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


    // update(conditions : Conditions, updates: UpdateFieldCommand[], getOriginalDocument?: GetOriginalDocumentCallback<T>) : Promise<T>
    // update(conditions : Conditions, updates: UpdateFieldCommand[], getOriginalDocument: GetOriginalDocumentCallback<T>, done: UpdateSingleCallback<T>) : void
    update(conditions : Conditions, updates: UpdateFieldCommand[], done?: ObjectCallback<DataType>) : any {
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


    promisify_update(conditions : Conditions, updates: UpdateFieldCommand[]): Promise<DataType> {
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


    // del(conditions : Conditions, getOriginalDocument?: (doc : T) => void) : Promise<void>
    // del(conditions : Conditions, getOriginalDocument: (doc : T) => void, done: DeleteSingleCallback) : void
    del(_id: DocumentID, done?: ErrorOnlyCallback): any {
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



    // find(conditions : Conditions, fields?: Fields, sort?: Sort, cursor?: Cursor) : Promise<T[]> 
    // find(conditions : Conditions, fields: Fields, sort: Sort, cursor: Cursor, done: FindCallback<T>) : void
    find(conditions: Conditions, fields: Fields, sort: Sort, cursor: Cursor, done?: ArrayCallback<DataType>) : any {
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
