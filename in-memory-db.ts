// import mongoose = require('mongoose')
// mongoose.Promise = Promise
import pino = require('pino')
import HTTP_STATUS = require('http-status-codes')

import configure = require('@sabbatical/configure-local')
import {ArrayCallback, Conditions, Cursor, DocumentID, DocumentBase, DocumentDatabase, ErrorOnlyCallback, Fields, getValue, ObjectCallback, ObjectOrArrayCallback, Sort, SupportedFeatures, UpdateFieldCommand} from '@sabbatical/document-database'

type DataType = DocumentBase


var log = pino({name: 'in-memory-db', enabled: !process.env.DISABLE_LOGGING})


function cloneObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }
    var temp
    if (obj instanceof Date) {
        temp = new Date(obj)
    } else {
        temp = obj.constructor(); // create new obj from original obj's constructor
        for (var key in obj) {
            temp[key] = cloneObject(obj[key]);
        }
    }
    return temp
}


function newError(msg, status) {
    let error = new Error(msg)
    error['http_status'] = status
    return error
}


// @return the element that contains a given field path
// for example: if  fieldpath == "hat.size", then this returns obj.hat,
// and if fieldpath == "hat", then this returns obj.
export function getContainingObject(obj: object, fieldpath: string): any {
    var name_components = fieldpath.split('.').slice(0, -1)
    name_components.forEach((name_component) => {
        obj = obj[name_component];
        if (obj == null)
            return null;
    })
    return obj;
}


// @return the name of the last component of a given field path
// for example: if  fieldpath == "hat.size", then this returns "size",
export function getLastField(obj: object, fieldpath: string): string {
    return fieldpath.split('.').slice(-1)[0]
}



export var SUPPORTED_FEATURES: SupportedFeatures = {
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
} 


function isObject(value: any): boolean {
    return (typeof value === 'object') && !(value instanceof Date)
}


export class InMemoryDB implements DocumentDatabase {

    next_id: number
    connected: boolean
    index: {[_id:string]: DataType}
    

    constructor() {
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


    connect(): Promise<void>
    connect(done: ErrorOnlyCallback): void
    connect(done?: ErrorOnlyCallback): Promise<void> | void {
        this.connected = true
        if (done) {
            done()
        } else {
            return Promise.resolve()
        }
    }


    disconnect(): Promise<void>
    disconnect(done: ErrorOnlyCallback): void
    disconnect(done?: ErrorOnlyCallback): Promise<void> | void {
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
                    cloned_obj._obj_ver = 1
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
    read(_id_or_ids: DocumentID | DocumentID[], done?: ObjectOrArrayCallback): Promise<DataType> | Promise<DataType[]> | void {
        if (done) {
            if (Array.isArray(_id_or_ids)) {
                var _ids = <DocumentID[]>_id_or_ids
            } else if ((typeof _id_or_ids === 'string') && (_id_or_ids.length > 0)) {
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
            //  [resolve type declarations for overloaded methods](https://github.com/psnider/in-memory-db/issues/1)
            return this.promisify_read(<any>_id_or_ids)
        }
    }


    promisify_read(_id: DocumentID): Promise<DataType>
    promisify_read(_ids: DocumentID[]) : Promise<DataType[]> 
    promisify_read(_id_or_ids: DocumentID | DocumentID[]): Promise<DataType> | Promise<DataType[]> {
        return new Promise((resolve, reject) => {
            // TODO: resolve this typing problem
            //  [resolve type declarations for overloaded methods](https://github.com/psnider/in-memory-db/issues/1)
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
                    let original_obj = this.getFromIndex(obj._id)
                    if (obj._obj_ver === original_obj._obj_ver) {
                        // the returned object is different from both the object saved, and the one provided
                        this.addToIndex(obj)
                        let cloned_obj = this.cloneFromIndex(obj._id)
                        cloned_obj._obj_ver++
                        done(undefined, cloned_obj)
                    } else {
                        done(newError(`replace refused due to intermediate update`, HTTP_STATUS.CONFLICT))
                    }
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


    performSet(obj: DocumentBase, update: UpdateFieldCommand): string {
        let component = getValue(obj, update.field)
        if ((component != null) && Array.isArray(component)) {
            if (component.length > 0) {
                if (isObject(component[0])) {
                    let i = component.findIndex((element) => {return element[update.key_field] === update.element_id})
                    if (i > -1) {
                        if (update.subfield) {
                            component[i][update.subfield] = update.value
                        } else {
                            component[i] = update.value
                        }
                    } else {
                        return `array element not found`
                    }
                } else {
                    let i = component.findIndex((element) => {return element === update.element_id})
                    if (i > -1) {
                        component[i] = update.value
                    } else {
                        return `array element not found`
                    }
                }
            } else {
                return `array element not found`
            }
        } else {
            let containing_obj = getContainingObject(obj, update.field)
            let last_field = getLastField(obj, update.field)
            if (containing_obj != null) {
                containing_obj[last_field] = update.value
            } else {
                return `update.field is invalid`
            }
        }
    }


    performUnset(obj: DocumentBase, update: UpdateFieldCommand): string {
        let component = getValue(obj, update.field)
        if ((component != null) && Array.isArray(component)) {
            if (isObject(component[0]) && update.subfield) {
                let i = component.findIndex((element) => {return element[update.key_field] === update.element_id})
                if (i > -1) {
                    component[i][update.subfield] = undefined
                } else {
                    return `array element not found`
                }
            } else {
                return `cmd=unset not allowed on array without a subfield, use cmd=remove`
            }
        } else {
            let containing_obj = getContainingObject(obj, update.field)
            let last_field = getLastField(obj, update.field)
            if (containing_obj != null) {
                containing_obj[last_field] = undefined
            } else {
                return `update.field is invalid`
            }
        }
    }


    performInsert(obj: DocumentBase, update: UpdateFieldCommand): string {
        let component = getValue(obj, update.field)
        if ((component != null) && Array.isArray(component)) {
            component.push(update.value)
        } else {
            return `insert only allowed on arrays`
        }
    }


    performRemove(obj: DocumentBase, update: UpdateFieldCommand): string {
        let component = getValue(obj, update.field)
        if ((component != null) && Array.isArray(component)) {
            let i
            if (isObject(component[0])) {
                i = component.findIndex((element) => {return element[update.key_field] === update.element_id})
            } else {
                i = component.findIndex((element) => {return element === update.element_id})
            }
            if (i > -1) {
                component.splice(i, 1)
            } else {
                return `array element not found`
            }
        } else {
            return `cmd=remove only allowed on arrays`
        }
    }


    performUpdates(obj: DocumentBase, updates: UpdateFieldCommand[]): Promise<DocumentBase> {
        return new Promise((resolve, reject) => {
            let error: string
            for (let i = 0 ; !error && (i < updates.length) ; ++i) {
                let update = updates[i]
                let component = getValue(obj, update.field)
                let containing_obj = getContainingObject(obj, update.field)
                let last_field = getLastField(obj, update.field)
                switch (update.cmd) {
                case 'set':
                    error = this.performSet(obj, update)
                    break
                case 'unset':
                    error = this.performUnset(obj, update)
                    break
                case 'insert':
                    error = this.performInsert(obj, update)
                    break
                case 'remove':
                    error = this.performRemove(obj, update)
                    break
                default:
                    error = `update does not support cmd=${update.cmd}`
                }
            }
            if (!error) {
                resolve(obj)
            } else {
                reject(new Error(error))
            }
        })
    }


    update(_id: DocumentID, _obj_ver: number, updates: UpdateFieldCommand[]): Promise<DataType>
    update(_id: DocumentID, _obj_ver: number, updates: UpdateFieldCommand[], done: ObjectCallback): void
    update(_id: DocumentID, _obj_ver: number, updates: UpdateFieldCommand[], done?: ObjectCallback): Promise<DataType> | void {
        if (done) {
            if (this.connected) {
                var stored_obj = this.cloneFromIndex(_id)
                if (stored_obj) {
                    if (_obj_ver === stored_obj._obj_ver) {
                        this.performUpdates(stored_obj, updates).then((updated_obj) => {
                            updated_obj._obj_ver++
                            this.addToIndex(updated_obj)
                            done(undefined, this.cloneFromIndex(_id))
                        }).catch((error) => {
                            done(error)
                        })
                    } else {
                        done(newError(`update refused due to intermediate update`, HTTP_STATUS.CONFLICT))
                    }
                } else {
                    done(newError(`_id is invalid`, HTTP_STATUS.BAD_REQUEST))
                }
            } else {
                var error = newError('not connected to database', HTTP_STATUS.INTERNAL_SERVER_ERROR)
                done(error)
            }
        } else {
            return this.promisify_update(_id, _obj_ver, updates)
        }
    }


    promisify_update(_id: DocumentID, _obj_ver: number, updates: UpdateFieldCommand[]): Promise<DataType> {
        return new Promise((resolve, reject) => {
            this.update(_id, _obj_ver, updates, (error, result) => {
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


