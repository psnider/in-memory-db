"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const CHAI = require("chai");
const expect = CHAI.expect;
const tests_1 = require("@sabbatical/document-database/tests");
const in_memory_db_1 = require("./in-memory-db");
var db = new in_memory_db_1.InMemoryDB();
let next_email_id = 1;
let next_mobile_number = 1234;
function newPerson(options) {
    const name = (options && options.name) ? options.name : { given: 'Bob', family: 'Smith' };
    const account_email = `${name.given}.${name.family}.${next_email_id++}@test.co`;
    const mobile_number = `555-${("000" + next_mobile_number++).slice(-4)}`;
    let person = {
        account_email,
        account_status: 'invitee',
        //role:              'user',
        name,
        locale: 'en_US',
        contact_methods: [{ method: 'mobile', address: mobile_number }],
        profile_pic_urls: ['shorturl.com/1234']
    };
    if (options && options._id)
        person._id = options._id;
    return person;
}
let next_contact_number = 1;
function newContactMethod() {
    const phone_number = `555-${("001" + next_mobile_number++).slice(-4)}`;
    return {
        method: ((next_contact_number++ % 2) == 0) ? 'phone' : 'mobile',
        address: phone_number
    };
}
var fields_used_in_tests = {
    populated_string: 'account_email',
    unpopulated_string: 'time_zone',
    unique_key_fieldname: 'account_email',
    string_array: { name: 'profile_pic_urls' },
    obj_array: {
        name: 'contact_methods',
        key_field: 'address',
        populated_field: { name: 'method', type: 'string' },
        unpopulated_field: { name: 'display_name', type: 'string' },
        createElement: newContactMethod
    }
};
describe('InMemoryDB', function () {
    function getDB() { return db; }
    before((done) => {
        db.connect(done);
    });
    after((done) => {
        db.disconnect(done);
    });
    describe('create()', function () {
        tests_1.test_create(getDB, newPerson, fields_used_in_tests);
    });
    describe('read()', function () {
        tests_1.test_read(getDB, newPerson, fields_used_in_tests);
    });
    describe('replace()', function () {
        tests_1.test_replace(getDB, newPerson, fields_used_in_tests, in_memory_db_1.SUPPORTED_FEATURES);
    });
    describe('update()', function () {
        tests_1.test_update(getDB, newPerson, fields_used_in_tests, in_memory_db_1.SUPPORTED_FEATURES);
    });
    describe('del()', function () {
        tests_1.test_del(getDB, newPerson, fields_used_in_tests);
    });
    describe('find()', function () {
        tests_1.test_find(getDB, newPerson, fields_used_in_tests, in_memory_db_1.SUPPORTED_FEATURES);
    });
});
