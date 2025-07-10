/// <reference types="jest" />

// This file helps IDEs recognize Jest globals in test files
declare global {
  var jest: typeof import('jest');
  var describe: jest.Describe;
  var it: jest.It;
  var test: jest.It;
  var expect: jest.Expect;
  var beforeAll: jest.Lifecycle;
  var afterAll: jest.Lifecycle;
  var beforeEach: jest.Lifecycle;
  var afterEach: jest.Lifecycle;
}

export {}; 