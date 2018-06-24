'use strict'

/* eslint-disable max-depth */

const acorn = require('acorn')
const walk = require('acorn/dist/walk')
const path = require('path')
const fs = require('fs')
const promisify = require('util').promisify

const read = promisify(fs.readFile)
const _glob = require('glob')
const glob = promisify((glob, cb) => _glob(glob, cb))

const NATIVE_MODULES = [ // src https://www.w3schools.com/nodejs/ref_modules.asp
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'domain', 'events',
  'fs', 'http', 'https', 'net', 'os', 'path', 'punycode', 'querystring', 'readline', 'stream',
  'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'zlib'
]

function getRequire (str) { // parses str with acorn and gets require() calls
  let req = []

  walk.full(acorn.parse(str, { ecmaVersion: '10' }), node => {
    if (node.type === 'CallExpression' && node.callee.name === 'require') {
      let arg = node.arguments[0]
      if (arg && arg.type === 'Literal') {
        let raw = arg.value
        let name
        let isModule = false
        let isFile = false
        switch (true) {
          case raw.startsWith('/') || raw.startsWith('.'):
            isFile = true
            break
          case raw.startsWith('@'):
            isModule = true
            name = raw.split('/').slice(0, 2).join('/')
            break
          default:
            isModule = true
            name = raw.split('/').slice(0, 1).join('/')
            break
        }
        req.push({
          start: node.start,
          end: node.end,
          name,
          path: raw,
          isModule,
          isFile
        })
      } // TODO: else warn user maybe?
    }
  })

  return req
}

function checkModule (options, dir, module) {
  let location
  try {
    location = require.resolve(module.path, { paths: options.nodeModules.concat([dir]) })
  } catch (e) {
    location = null
  }

  return {
    installed: Boolean(location),
    location,
    isDep: options.deps.indexOf(module.name) !== -1,
    isDevDep: options.devDeps.indexOf(module.name) !== -1,
    isNative: NATIVE_MODULES.indexOf(module.name) !== -1
  }
}

function createWarning ({content, offset, file, dep, check, error}, message) {
  let {start, end} = dep

  if (offset) {
    start += offset
    end += offset
    content = ' '.repeat(offset - 1) + '\n' + content
  }

  let split = content.substr(0, start).split('\n')
  let line = split.length
  let column = split.pop().length + 1

  split = content.substr(0, end).split('\n')
  let lineTo = split.length
  let columnTo = split.pop().length + 1

  return {
    message,
    error: error || false,
    location: {
      file,
      from: {
        line,
        column
      },
      to: {
        line: lineTo,
        column: columnTo
      }
    },
    dependency: dep.name
  }
}

async function reallyRequire (modulePath, options, cb) {
  modulePath = fs.realpathSync(modulePath)
  if (!options) { options = {} }
  if (!options.packageJSON) { options.packageJSON = path.join(modulePath, 'package.json') }
  if (!options.sourceGlob) { options.sourceGlob = ['*.js', 'src/**/*.js', 'lib/**/*.js'] } // unsafe alternative: !(node_modules|test)/**/*.js
  if (!Array.isArray(options.sourceGlob)) { options.sourceGlob = [options.sourceGlob] }
  if (!options.nodeModules) { options.nodeModules = [ path.join(modulePath, 'node_modules') ] }

  let pkg
  try {
    pkg = typeof options.packageJSON === 'object' ? options.packageJSON : JSON.parse(String(await read(options.packageJSON)))
  } catch (e) {
    throw new Error('Couldn\'t read ' + options.packageJSON + ': ' + e.toString())
  }

  if (!options.mute) { options.mute = pkg.reallyRequireMute }
  if (!options.mute) { options.mute = { unused: [], indirect: [] } }

  options.deps = Object.keys(pkg.dependencies || {})
  options.devDeps = Object.keys(pkg.devDependencies || {})

  let unused = Object.keys(pkg.dependencies)

  let files = []
  for (let i1 = 0; i1 < options.sourceGlob.length; i1++) {
    files = files.concat(await glob(modulePath + '/' + options.sourceGlob[i1]))
  }

  let result = {
    missing: [],
    unused: [],
    errors: []
  }

  for (let i2 = 0; i2 < files.length; i2++) {
    let file = files[i2]

    try {
      let content = String(await read(file))
      let offset = 0
      if (content.startsWith('#')) { // remove #!
        let s = content.split('\n')
        offset += s.shift().length + 1
        content = s.join('\n')
      }

      const required = getRequire(content)

      for (let i3 = 0; i3 < required.length; i3++) {
        let dep = required[i3]
        let check = checkModule(options, path.dirname(file), dep)

        if (dep.isFile) {
          if (!check.installed) {
            result.missing.push(createWarning({content, offset, file, dep, check, error: true}, 'Required file "' + dep.path + '" is missing!'))
          }
        } else if (dep.isModule && !check.isNative) {
          unused = unused.filter(d => d !== dep.name)
          if (check.isDevDep && !check.isDep && options.mute.indirect.indexOf(dep.name) === -1) {
            result.missing.push(createWarning({content, offset, file, dep, check}, 'Dependency "' + dep.name + '" is installed as devDependency!'))
          } else if (!check.installed) {
            result.missing.push(createWarning({content, offset, file, dep, check, error: true}, 'Dependency "' + dep.name + '" is missing from package.json and node_modules!'))
          } else if (!check.isDep && options.mute.indirect.indexOf(dep.name) === -1) {
            result.missing.push(createWarning({content, offset, file, dep, check}, 'Dependency "' + dep.name + '" is missing from package.json! It is only indirectly installed and might be missing in production!'))
          }
        }
      }
    } catch (error) {
      result.errors.push({file, error})
    }
  }

  unused.forEach(u => {
    if (options.mute.unused.indexOf(u) === -1) {
      result.unused.push({
        dependency: u,
        error: false,
        message: 'Dependency "' + u + '" is never used! Move it to devDependencies or remove it!'
      })
    }
  })

  return result
}

module.exports = reallyRequire
