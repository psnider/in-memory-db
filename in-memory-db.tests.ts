import CHAI                 = require('chai')
const  expect               = CHAI.expect

import {ArrayCallback, Conditions, Cursor, DocumentID, DocumentDatabase, ErrorOnlyCallback, Fields, ObjectCallback, Sort, UpdateFieldCommand} from 'document-database-if'
import {UpdateConfiguration, test_create, test_read, test_replace, test_del, test_update, test_find} from 'document-database-tests'

// select either: people-db-mongo or people-db-in-memory

import {InMemoryDB} from 'in-memory-db'


var db: DocumentDatabase<Person> = new InMemoryDB('people', 'Person')


// example data type, from people-service project
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

// This is identical to newPerson() in people-db.tests.ts
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




// NOTE: these tests are identical to the ones in people-service.tests.ts
describe('InMemoryDB', function() {

    function getDB() {return db}

    before((done) => {
        db.connect(done)
    })


    after((done) => {
        db.disconnect(done)
    })
    

    describe('create()', function() {
         test_create<Person>(getDB, newPerson, ['account_email', 'locale'])        
    })


    describe('read()', function() {
         test_read<Person>(getDB, newPerson, ['account_email', 'locale'])        
    })


    describe('replace()', function() {
         test_replace<Person>(getDB, newPerson, ['account_email', 'locale'])        
    })


    describe('update()', function() {
        var config: UpdateConfiguration = {
            test: {
                populated_string: 'account_email',
                unpopulated_string: 'time_zone',
                obj_array: {
                    name: 'contact_methods',
                    key_field: 'address',
                    populated_field: {name:'method', type: 'string'},
                    createElement: newContactMethod
                }
            },
            unsupported: {
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
        }

        test_update<Person>(getDB, newPerson, config)
    })


    describe('del()', function() {
         test_del<Person>(getDB, newPerson, ['account_email', 'locale'])        
    })


    describe('find()', function() {
         test_find<Person>(getDB, newPerson, 'account_email')
    })


})
