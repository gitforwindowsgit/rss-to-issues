const { expect, test } = require('@jest/globals')
const https = require('https')

jest.mock('@actions/core')
jest.mock('@actions/github')
jest.mock('turndown')

const core = require('@actions/core')
const { getOctokit } = require('@actions/github')

const run = require('..')

core.getInput = (key) => core.__INPUTS__[key]
core.__INPUTS__ = {
  feed: 'https://test.feed',
  'max-age': '48h',
  'github-token': 'TOKEN'
}

const mockHTTPSGet = {
  write: jest.fn(),
  on: jest.fn().mockImplementation((event, cb) => {
    if (event === 'end') {
      cb()
    } else if (event === 'data') {
      cb(mockHTTPSGet.__RETURN__)
    }
  }),
  end: jest.fn(),
  setEncoding: jest.fn(),
  headers: {
    'content-length': 0
  }
}
https.get = jest.fn().mockImplementation((url, callback) => {
  mockHTTPSGet.headers['content-length'] = mockHTTPSGet.__RETURN__.length
  callback(mockHTTPSGet)
  return mockHTTPSGet
})

const octokit = {
  issues: {
    create: jest.fn(),
    listForRepo: jest.fn()
  }
}
getOctokit.mockImplementation(() => octokit)

test('handles feeds without any entries', async () => {
  mockHTTPSGet.__RETURN__ = '<feed xmlns="http://www.w3.org/2005/Atom" />'
  await run()

  expect(https.get).toBeCalledTimes(1)
  expect(octokit.issues.listForRepo).not.toBeCalled()
  expect(octokit.issues.create).not.toBeCalled()
})
