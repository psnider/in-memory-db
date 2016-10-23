"use strict";
var CHAI = require('chai');
var expect = CHAI.expect;
var document_database_tests_1 = require('document-database-tests');
// select either: people-db-mongo or people-db-in-memory
var in_memory_db_1 = require('in-memory-db');
var db = new in_memory_db_1.InMemoryDB('people', 'Person');
var next_email_id = 1;
var next_mobile_number = 1234;
// This is identical to newPerson() in people-db.tests.ts
function newPerson(options) {
    var name = (options && options.name) ? options.name : { given: 'Bob', family: 'Smith' };
    var account_email = name.given + "." + name.family + "." + next_email_id++ + "@test.co";
    var mobile_number = "555-" + ("000" + next_mobile_number++).slice(-4);
    var person = {
        account_email: account_email,
        account_status: 'invitee',
        //role:              'user',
        name: name,
        locale: 'en_US',
        contact_methods: [{ method: 'mobile', address: mobile_number }],
        profile_pic_urls: ['shorturl.com/1234']
    };
    if (options && options._id)
        person._id = options._id;
    return person;
}
var next_contact_number = 1;
function newContactMethod() {
    var phone_number = "555-" + ("001" + next_mobile_number++).slice(-4);
    return {
        method: ((next_contact_number++ % 2) == 0) ? 'phone' : 'mobile',
        address: phone_number
    };
}
var fields_used_in_tests = {
    populated_string: 'account_email',
    unpopulated_string: 'time_zone',
    obj_array: {
        name: 'contact_methods',
        key_field: 'address',
        populated_field: { name: 'method', type: 'string' },
        createElement: newContactMethod
    }
};
// NOTE: these tests are identical to the ones in people-service.tests.ts
describe('InMemoryDB', function () {
    function getDB() { return db; }
    before(function (done) {
        db.connect(done);
    });
    after(function (done) {
        db.disconnect(done);
    });
    describe('create()', function () {
        document_database_tests_1.test_create(getDB, newPerson, ['account_email', 'locale']);
    });
    describe('read()', function () {
        document_database_tests_1.test_read(getDB, newPerson, ['account_email', 'locale']);
    });
    describe('replace()', function () {
        document_database_tests_1.test_replace(getDB, newPerson, ['account_email', 'locale']);
    });
    describe('update()', function () {
        var config = {
            test: fields_used_in_tests,
            unsupported: in_memory_db_1.UNSUPPORTED_UPDATE_CMDS
        };
        document_database_tests_1.test_update(getDB, newPerson, config);
    });
    describe('del()', function () {
        document_database_tests_1.test_del(getDB, newPerson, ['account_email', 'locale']);
    });
    describe('find()', function () {
        document_database_tests_1.test_find(getDB, newPerson, 'account_email');
    });
});
