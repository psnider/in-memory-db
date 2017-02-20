import {ArrayCallback, Conditions, Cursor, DocumentID, DocumentBase, DocumentDatabase, ErrorOnlyCallback, Fields, ObjectCallback, ObjectOrArrayCallback, Sort, SupportedFeatures, UpdateFieldCommand} from '@sabbatical/document-database'

type DocumentType = DocumentBase

export var SUPPORTED_FEATURES: SupportedFeatures

export class InMemoryDB extends DocumentDatabase {
    connect(done: ErrorOnlyCallback): void
    connect() : Promise<void>
    disconnect(done: ErrorOnlyCallback): void
    disconnect() : Promise<void>
    create(obj: DocumentType): Promise<DocumentType>
    create(obj: DocumentType, done: ObjectCallback): void
    read(_id: DocumentID) : Promise<DocumentType> 
    read(_id: DocumentID, done: ObjectCallback) : void
    read(_ids: DocumentID[]) : Promise<DocumentType[]> 
    read(_ids: DocumentID[], done: ArrayCallback) : void
    replace(obj: DocumentType) : Promise<DocumentType>
    replace(obj: DocumentType, done: ObjectCallback) : void
    update(_id: DocumentID, _obj_ver: number, updates: UpdateFieldCommand[]) : Promise<DocumentType>
    update(_id: DocumentID, _obj_ver: number, updates: UpdateFieldCommand[], done: ObjectCallback) : void
    del(_id: DocumentID) : Promise<void>
    del(_id: DocumentID, done: ErrorOnlyCallback) : void
    find(conditions : Conditions, fields?: Fields, sort?: Sort, cursor?: Cursor) : Promise<DocumentType[]> 
    find(conditions : Conditions, fields: Fields, sort: Sort, cursor: Cursor, done: ArrayCallback) : void
}
