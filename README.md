# really-require

A module that checks for unused and missing dependencies

## API

`reallyRequire(modulePath, options)`:
- `modulePath`:
  - String: Full or relative path to module
- `options.packageJSON`:
  - String: Path to package.json. Object, values of package.json.
  - Default: `path.join(modulePath, 'package.json')`
- `options.sourceGlob`:
  - String[]: Globs to use for searching the source files.
  - Default: `['*.js', 'src/**/*.js', 'lib/**/*.js']`
- `options.nodeModules`:
  - String[]: paths to search in for modules.
  - Default: `[path.join(modulePath, 'node_modules')]`

Returns:
 - `result.missing`: Object[] Messages about missing dependencies
 - `result.missing[].error`: Flag if the warning is fatal
 - `result.missing[].message`: Message to display
 - `result.missing[].dependency`: Dependency name
 - `result.missing[].location`: Location of the error
 - `result.missing[].location.file`: Filename
 - `result.missing[].location.from.line`: Line at which the statement begins
 - `result.missing[].location.from.column`: Column at which the statement begins
 - `result.missing[].location.to.line`: Line at which the statement ends
 - `result.missing[].location.to.column`: Column at which the statement ends
 - `result.unused`: Object[] Messages about unused dependencies
 - `result.unused[].error`: Flag if the warning is fatal
 - `result.unused[].message`: Message to display
 - `result.unused[].dependency`: Dependency name
 - `result.errors`: Object[] Parsing errors that occured
 - `result.errors[].file`: File which caused the error
 - `result.errors[].error`: Error Object
