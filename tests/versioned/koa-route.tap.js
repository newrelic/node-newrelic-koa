/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const tap = require('tap')
const utils = require('@newrelic/test-utilities')
const http = require('http')
const hooks = require('../../nr-hooks')

utils(tap)

tap.test('koa-route instrumentation', function (t) {
  let helper = null
  let app = null
  let server = null
  let route = null

  t.beforeEach(function () {
    helper = utils.TestAgent.makeInstrumented()
    helper.registerInstrumentation(hooks[0])
    helper.registerInstrumentation(hooks[3])
    const Koa = require('koa')
    app = new Koa()
    route = require('koa-route')
  })

  t.afterEach(function () {
    server.close()
    app = null
    route = null
    helper && helper.unload()
  })

  t.test('should name and produce segments for koa-route middleware', function (t) {
    const first = route.get('/resource', function firstMiddleware(ctx) {
      ctx.body = 'hello'
    })
    app.use(first)
    helper.agent.on('transactionFinished', function (tx) {
      t.exactSegments(tx.trace.root, [
        {
          name: 'WebTransaction/WebFrameworkUri/Koa/GET//resource',
          children: [
            {
              name: 'Nodejs/Middleware/Koa/firstMiddleware//resource'
            }
          ]
        }
      ])
      t.equal(
        tx.name,
        'WebTransaction/WebFrameworkUri/Koa/GET//resource',
        'transaction should be named after the middleware responsible for responding'
      )
      t.end()
    })
    run('/resource')
  })

  t.test('should name the transaction after the last responder', function (t) {
    const first = route.get('/:first', function firstMiddleware(ctx, param, next) {
      ctx.body = 'first'
      return next()
    })
    const second = route.get('/:second', function secondMiddleware(ctx) {
      ctx.body = 'second'
    })
    app.use(first)
    app.use(second)
    helper.agent.on('transactionFinished', function (tx) {
      t.exactSegments(tx.trace.root, [
        {
          name: 'WebTransaction/WebFrameworkUri/Koa/GET//:second',
          children: [
            {
              name: 'Nodejs/Middleware/Koa/firstMiddleware//:first',
              children: [
                {
                  name: 'Nodejs/Middleware/Koa/secondMiddleware//:second'
                }
              ]
            }
          ]
        }
      ])
      t.equal(
        tx.name,
        'WebTransaction/WebFrameworkUri/Koa/GET//:second',
        'transaction should be named after the middleware responsible for responding'
      )
      t.end()
    })
    run()
  })

  t.test('should name the transaction properly when responding after next', function (t) {
    const first = route.get('/:first', function firstMiddleware(ctx, param, next) {
      return next().then(function respond() {
        ctx.body = 'first'
      })
    })
    const second = route.get('/:second', function secondMiddleware(ctx) {
      ctx.body = 'second'
    })
    app.use(first)
    app.use(second)
    helper.agent.on('transactionFinished', function (tx) {
      t.exactSegments(tx.trace.root, [
        {
          name: 'WebTransaction/WebFrameworkUri/Koa/GET//:first',
          children: [
            {
              name: 'Nodejs/Middleware/Koa/firstMiddleware//:first',
              children: [
                {
                  name: 'Nodejs/Middleware/Koa/secondMiddleware//:second'
                }
              ]
            }
          ]
        }
      ])
      t.equal(
        tx.name,
        'WebTransaction/WebFrameworkUri/Koa/GET//:first',
        'transaction should be named after the middleware responsible for responding'
      )
      t.end()
    })
    run()
  })

  t.test('should work with early responding', function (t) {
    const first = route.get('/:first', function firstMiddleware(ctx) {
      ctx.body = 'first'
      return Promise.resolve()
    })
    const second = route.get('/:second', function secondMiddleware(ctx) {
      ctx.body = 'second'
    })
    app.use(first)
    app.use(second)
    helper.agent.on('transactionFinished', function (tx) {
      t.exactSegments(tx.trace.root, [
        {
          name: 'WebTransaction/WebFrameworkUri/Koa/GET//:first',
          children: [
            {
              name: 'Nodejs/Middleware/Koa/firstMiddleware//:first'
            }
          ]
        }
      ])
      t.equal(
        tx.name,
        'WebTransaction/WebFrameworkUri/Koa/GET//:first',
        'transaction should be named after the middleware responsible for responding'
      )
      t.end()
    })
    run()
  })

  t.test('should name the transaction after the source of the error that occurred', function (t) {
    const first = route.get('/:first', function firstMiddleware(ctx, param, next) {
      return next()
    })
    const second = route.get('/:second', function secondMiddleware() {
      throw new Error('some error')
    })
    app.use(first)
    app.use(second)
    helper.agent.on('transactionFinished', function (tx) {
      t.exactSegments(tx.trace.root, [
        {
          name: 'WebTransaction/WebFrameworkUri/Koa/GET//:second',
          children: [
            {
              name: 'Nodejs/Middleware/Koa/firstMiddleware//:first',
              children: [
                {
                  name: 'Nodejs/Middleware/Koa/secondMiddleware//:second'
                }
              ]
            }
          ]
        }
      ])
      t.equal(
        tx.name,
        'WebTransaction/WebFrameworkUri/Koa/GET//:second',
        'transaction should be named after the middleware responsible for responding'
      )
      t.end()
    })
    run()
  })

  t.test('should work properly when used along with non-route middleware', function (t) {
    const first = function firstMiddleware(ctx, next) {
      return next()
    }
    const second = route.get('/resource', function secondMiddleware(ctx, next) {
      ctx.body = 'hello'
      return next()
    })
    const third = function thirdMiddleware(ctx, next) {
      return next()
    }
    app.use(first)
    app.use(second)
    app.use(third)
    helper.agent.on('transactionFinished', function (tx) {
      t.exactSegments(tx.trace.root, [
        {
          name: 'WebTransaction/WebFrameworkUri/Koa/GET//resource',
          children: [
            {
              name: 'Nodejs/Middleware/Koa/firstMiddleware',
              children: [
                {
                  name: 'Nodejs/Middleware/Koa/secondMiddleware//resource',
                  children: [
                    {
                      name: 'Nodejs/Middleware/Koa/thirdMiddleware'
                    }
                  ]
                }
              ]
            }
          ]
        }
      ])
      t.equal(
        tx.name,
        'WebTransaction/WebFrameworkUri/Koa/GET//resource',
        'transaction should be named after the middleware responsible for responding'
      )
      t.end()
    })
    run('/resource')
  })

  t.autoend()

  function run(path) {
    server = app.listen(0, function () {
      http
        .get({
          port: server.address().port,
          path: path || '/123'
        })
        .end()
    })
  }
})
