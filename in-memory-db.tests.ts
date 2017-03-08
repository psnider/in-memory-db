import CHAI                 = require('chai')
const  expect               = CHAI.expect

import {ArrayCallback, Conditions, Cursor, DocumentID, DocumentDatabase, ErrorOnlyCallback, Fields, ObjectCallback, Sort, UpdateFieldCommand} from '@sabbatical/document-database'
import {FieldsUsedInTests, test_create, test_read, test_replace, test_del, test_update, test_find} from '@sabbatical/document-database/tests'


import {InMemoryDB, SUPPORTED_FEATURES} from './in-memory-db'


var db: DocumentDatabase = new InMemoryDB()


type DatabaseObjectID = string;
type URL = string;


export interface Name {
    family?: string;
    given?: string;
    additional?: string;
}


export type ContactMethodType = 'mobile' | 'phone' | 'twitter'
export interface ContactMethod {
    method?: string;
    address?: string;
    display_name?: string
}


export interface Person {
    // NOTE: leading underscore indicates this is special, in this case, not set by user
    _id?:               DatabaseObjectID;
    _test_only?:        boolean;
    account_email?:     string;
    account_status?:    string;
    name?:              Name;
    locale?:            string;
    time_zone?:         string;
    role?:              string;
    contact_methods?:   ContactMethod[];
    profile_pic_urls?:  URL[];
}




let next_email_id = 1
let next_mobile_number = 1234

function newPerson(options?: {_id?: string, name?: Name}) : Person {
    const name = (options && options.name) ? options.name : {given: 'Bob', family: 'Smith'}
    const account_email = `${name.given}.${name.family}.${next_email_id++}@test.co`
    const mobile_number = `555-${("000" + next_mobile_number++).slice(-4)}`
    let person : Person = {
        account_email,
        account_status:    'invitee',
        //role:              'user',
        name,
        locale:            'en_US',
        contact_methods:   [{method: 'mobile', address: mobile_number}],
        profile_pic_urls:  ['shorturl.com/1234']
    }
    if (options && options._id) person._id = options._id
    return person
}


let next_contact_number = 1
function newContactMethod() : ContactMethod {
    const phone_number = `555-${("001" + next_mobile_number++).slice(-4)}`
    return {
        method: ((next_contact_number++ % 2) == 0) ? 'phone' : 'mobile', 
        address: phone_number
    }
}


var fields_used_in_tests: FieldsUsedInTests = {
    populated_string: 'account_email',
    unpopulated_string: 'time_zone',
    unique_key_fieldname: 'account_email',
    string_array: {name: 'profile_pic_urls'},
    obj_array: {
        name: 'contact_methods',
        key_field: 'address',
        populated_field: {name:'method', type: 'string'},
        unpopulated_field: {name:'display_name', type: 'string'},
        createElement: newContactMethod
    }
}



describe('InMemoryDB', function() {

    function getDB() {return db}

    before((done) => {
        db.connect(done)
    })


    after((done) => {
        db.disconnect(done)
    })
    

    describe('create()', function() {
         test_create<Person>(getDB, newPerson, fields_used_in_tests)        
    })


    describe('read()', function() {
         test_read<Person>(getDB, newPerson, fields_used_in_tests)        
    })


    describe('replace()', function() {
         test_replace<Person>(getDB, newPerson, fields_used_in_tests, SUPPORTED_FEATURES)        
    })


    describe('update()', function() {
        test_update<Person>(getDB, newPerson, fields_used_in_tests, SUPPORTED_FEATURES)
    })


    describe('del()', function() {
         test_del<Person>(getDB, newPerson, fields_used_in_tests)        
    })


    describe('find()', function() {
         test_find<Person>(getDB, newPerson, fields_used_in_tests, SUPPORTED_FEATURES)
    })


})
