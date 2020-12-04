"use strict";

require("core-js/modules/es.array.concat");

require("core-js/modules/es.array.filter");

require("core-js/modules/es.array.from");

require("core-js/modules/es.array.includes");

require("core-js/modules/es.array.map");

require("core-js/modules/es.array.slice");

require("core-js/modules/es.regexp.constructor");

require("core-js/modules/es.string.ends-with");

require("core-js/modules/es.string.includes");

require("core-js/modules/es.string.split");

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _createForOfIteratorHelper(o, allowArrayLike) { var it; if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = o[Symbol.iterator](); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it.return != null) it.return(); } finally { if (didErr) throw err; } } }; }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }

const fs = require('fs');

const glob = require('glob');

const _require = require('child_process'),
      execSync = _require.execSync;

const compiler = require('vue-template-compiler');

const isBuiltInModule = require('is-builtin-module');

const ora = require('ora');

const logSymbols = require('log-symbols');

const Walker = require('node-source-walk');

const colors = require('colors');

const argv = require('yargs').argv;

const packageJson = require('package-json');

const https = require('https');

const whichpm = require('which-pm');

const notifier = require('node-notifier');
/* File reader
 * Return contents of given file
 */


let readFile = path => {
  let content = fs.readFileSync(path, 'utf8');
  return content;
};
/* Get installed modules
 * Read dependencies array from package.json
 */


let getInstalledModules = () => {
  let content = JSON.parse(readFile('package.json'));
  let installedModules = [];
  let dependencies = content.dependencies || {};
  let devDependencies = content.devDependencies || {};

  for (var _i = 0, _Object$keys = Object.keys(dependencies); _i < _Object$keys.length; _i++) {
    let key = _Object$keys[_i];
    installedModules.push({
      name: key,
      dev: false
    });
  }

  for (var _i2 = 0, _Object$keys2 = Object.keys(devDependencies); _i2 < _Object$keys2.length; _i2++) {
    let key = _Object$keys2[_i2];
    installedModules.push({
      name: key,
      dev: true
    });
  }

  return installedModules;
};
/* Get all js files
 * Return path of all js files
 */


const getFilesPath = () => {
  const path1 = glob.sync('**/*.js', {
    ignore: ['**/node_modules/**/*']
  }); // const path4 = glob.sync("**/*.ts", { ignore: ['**/node_modules/**/*'] });

  const path2 = glob.sync('**/*.jsx', {
    ignore: ['**/node_modules/**/*']
  });
  const path3 = glob.sync('**/*.vue', {
    ignore: ['**/node_modules/**/*']
  });
  return path1.concat(path2, path3);
};
/* Check for valid string - to stop malicious intentions */


const isValidModule = name => {
  // let regex = new RegExp("^([a-z0-9-_]{1,})$");
  let regex = new RegExp('^([@a-z0-9-_/]{1,})$');
  return regex.test(name);
};
/* Parses through file to extract dependencies used in file
 * Return array of dependencies
 */


const detective = (src, options) => {
  const walker = new Walker();
  const dependencies = [];
  walker.walk(src, node => {
    switch (node.type) {
      case 'ImportDeclaration':
        if (options && options.skipTypeImports && node.importKind == 'type') {
          break;
        }

        if (!node.source) {
          return dependencies;
        }

        if (node.source && node.source.value) {
          dependencies.push(node.source.value);
        }

        break;

      case 'CallExpression':
        const args = node.arguments;

        if (node.callee.name === 'require' && args.length) {
          dependencies.push(args[0].value);
        }

        if (node.callee.type === 'Import' && args.length) {
          dependencies.push(args[0].value);
        }

      default:
        return;
    }
  });
  return dependencies;
};
/* Find modules from file
 * Returns array of modules from a file
 */


const getModulesFromFile = path => {
  const content = fs.readFileSync(path, 'utf8');
  let output = '';

  if (path.endsWith('.vue')) {
    if (compiler.parseComponent(content).script) output = compiler.parseComponent(content).script.content;
  } else output = content; // return output;


  let allModules = []; //set options for babel parser used in detective module

  const detectiveOptions = {
    sourceType: 'module',
    errorRecovery: true,
    allowImportExportEverywhere: true
  };

  try {
    //sniff file for ES6 import statements
    allModules = detective(output, detectiveOptions); // filter modules;

    allModules = allModules.filter(module => isValidModule(module));
  } catch (err) {
    const line = content.split('\n')[err.loc.line - 1];
    const error = `Babel parser error. Could not parse '${path}'. There is a syntax error in file at line ${err.loc.line} column: ${err.loc.column}\ncausing all modules used in this file ONLY to be uninstalled`;
    handleError(error);
  } // return filtered modules;


  allModules = allModules.filter(module => isValidModule(module));
  return allModules;
};
/* Is test file?
 * [.spec.js, .test.js] are supported test file formats
 */


let isTestFile = name => name.endsWith('.spec.js') || name.endsWith('.test.js');
/* Dedup similar modules
 * Deduplicates list
 * Ignores/assumes type of the modules in list
 */


let deduplicateSimilarModules = modules => {
  let dedupedModules = [];
  let dedupedModuleNames = [];

  var _iterator = _createForOfIteratorHelper(modules),
      _step;

  try {
    for (_iterator.s(); !(_step = _iterator.n()).done;) {
      let module = _step.value;

      if (!dedupedModuleNames.includes(module.name)) {
        dedupedModules.push(module);
        dedupedModuleNames.push(module.name);
      }
    }
  } catch (err) {
    _iterator.e(err);
  } finally {
    _iterator.f();
  }

  return dedupedModules;
};
/* Dedup modules
 * Divide modules into prod and dev
 * Deduplicates each list
 */


let deduplicate = modules => {
  let dedupedModules = [];
  let testModules = modules.filter(module => module.dev);
  dedupedModules = dedupedModules.concat(deduplicateSimilarModules(testModules));
  let prodModules = modules.filter(module => !module.dev);
  dedupedModules = dedupedModules.concat(deduplicateSimilarModules(prodModules));
  return dedupedModules;
};
/* Get used modules
 * Read all .js files and grep for modules
 */


const getUsedModules = () => {
  //grab all files matching extensions programmed in "getFilesPath" function
  const filesPath = getFilesPath();
  let usedModules = []; //loop through returned 'filesPath' array

  var _iterator2 = _createForOfIteratorHelper(filesPath),
      _step2;

  try {
    for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
      const filePath = _step2.value;
      // Sniff each file for modules used in file
      let modulesFromFile = getModulesFromFile(filePath); //check and set set 'dev' key on file extenstion matching ".test.js" or ".spec.js"

      const dev = isTestFile(filePath);

      var _iterator3 = _createForOfIteratorHelper(modulesFromFile),
          _step3;

      try {
        for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
          const name = _step3.value;
          usedModules.push({
            name,
            dev
          });
        }
      } catch (err) {
        _iterator3.e(err);
      } finally {
        _iterator3.f();
      }
    }
  } catch (err) {
    _iterator2.e(err);
  } finally {
    _iterator2.f();
  }

  usedModules = deduplicate(usedModules);
  return usedModules;
};
/* Handle error
 * Pretty error message for common errors
 */


let handleError = err => {
  if (err.includes('E404')) {
    console.log(colors.red('Module is not in the npm registry.'));
  } else if (err.includes('ENOTFOUND')) {
    console.log(colors.red('Could not connect to npm, check your internet connection!'));
  } else console.log(colors.red(err));
};
/* Command runner
 * Run a given command
 */


let runCommand = (command, moduleName, notify) => {
  let succeeded = true;
  let message = `Package '${moduleName}' installed`;
  const found = command.includes('uninstall') || command.includes('remove');
  if (found) message = `Package '${moduleName}' removed`;

  try {
    execSync(command, {
      encoding: 'utf8'
    });
    if (notify) showNotification(message);
  } catch (error) {
    succeeded = false;
    if (notify) showNotification(`Error installing ${moduleName}`);
  }

  return succeeded;
};
/* Show pretty outputs
 * Use ora spinners to show what's going on
 */


let startSpinner = (message, type) => {
  let spinner = ora();
  spinner.text = message;
  spinner.color = type;
  spinner.start();
  return spinner;
};

let stopSpinner = (spinner, message, type) => {
  spinner.stop();
  if (!message) return;
  let symbol;
  if (type === 'red') symbol = logSymbols.error;else if (type === 'yellow') symbol = logSymbols.warning;else symbol = logSymbols.success;
  console.log(symbol, message);
};
/* Is module popular? - for secure mode */


const POPULARITY_THRESHOLD = 10000;

let isModulePopular = (name, callback) => {
  let spinner = startSpinner(`Checking ${name}`, 'yellow');
  let url = `https://api.npmjs.org/downloads/point/last-month/${name}`;
  https.get(url).then(response => {
    let body = '';
    response.on('data', data => {
      body += data;
    });
    response.on('end', () => {
      stopSpinner(spinner);
      let downloads = JSON.parse(body).downloads;
      callback(downloads > POPULARITY_THRESHOLD);
    });
  }).catch(error => {
    console.log(colors.red('Could not connect to npm, check your internet connection!'), error);
  });
};
/* Get package manager used
 *
 */


const whichPackageManager = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(function* () {
    try {
      const res = yield whichpm(process.cwd());
      return res.name;
    } catch (err) {
      return handleError(err);
    }
  });

  return function whichPackageManager() {
    return _ref.apply(this, arguments);
  };
}();
/* Get install command
 *
 * Depends on package manager, dev and exact
 */


let getInstallCommand = /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator(function* (name, dev) {
    const packageManager = yield whichPackageManager();
    let command;

    if (packageManager === 'npm') {
      command = `npm install ${name} --save`;
      if (dev) command += '-dev';
      if (argv.exact) command += ' --save-exact';
    } else if (packageManager === 'yarn') {
      command = `yarn add ${name}`;
      if (dev) command += ' --dev'; // yarn always adds exact
    }

    return command;
  });

  return function getInstallCommand(_x, _x2) {
    return _ref2.apply(this, arguments);
  };
}();

let isScopedModule = name => name[0] === '@';
/* Install module
 * Install given module
 */


const beginInstallModule = /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator(function* (name, dev, notify) {
    let spinner = startSpinner(`Installing '${name}'`, 'green');
    let command = yield getInstallCommand(name, dev);
    let message = `'${name}' installed`;
    if (dev) message += ' in devDependencies';
    let success = runCommand(command, name, notify);
    if (success) stopSpinner(spinner, message, 'green');else stopSpinner(spinner, `'${name}' installation failed`, 'yellow');
  });

  return function beginInstallModule(_x3, _x4, _x5) {
    return _ref3.apply(this, arguments);
  };
}();

const installModule = ({
  name,
  dev
}, notify) => {
  if (isScopedModule(name)) {
    packageJson(name).then(() => {
      beginInstallModule(name, dev, notify);
    }).catch(() => {});
  } else {
    beginInstallModule(name, dev, notify);
  }
};
/* is scoped module? */

/* Install module if author is trusted */


let installModuleIfTrustedAuthor = ({
  name,
  dev
}, notify) => {
  let trustedAuthor = argv['trust-author'];
  packageJson(name).then(json => {
    if (json.author && json.author.name === trustedAuthor) {
      installModule({
        name,
        dev
      }, notify);
    } else console.log(colors.red(`${name} not trusted`));
  });
};

const installIfPopular = ({
  name,
  dev
}, notify) => {
  isModulePopular(name, popular => {
    // Popular as proxy for trusted
    if (popular) installModule({
      name,
      dev
    }, notify); // Trusted Author
    else if (argv['trust-author']) {
        installModuleIfTrustedAuthor({
          name,
          dev
        }, notify);
      } // Not trusted
      else console.log(colors.red(`'${name}' not trusted`));
  });
};
/* Install module if trusted
 * Call isModulePopular before installing
 */


let installModuleIfTrusted = ({
  name,
  dev
}, notify) => {
  // Trust scoped modules
  if (isScopedModule(name)) {
    packageJson(name).then(() => {
      installIfPopular({
        name,
        dev
      }, notify);
    }).catch(err => {// handleError(err.message);
    });
  } else {
    installIfPopular({
      name,
      dev
    }, notify);
  }
};
/* Get uninstall command
 *
 * Depends on package manager
 */


let getUninstallCommand = name => {
  let packageManager = 'npm';
  if (argv.yarn) packageManager = 'yarn';
  let command;
  if (packageManager === 'npm') command = `npm uninstall ${name} --save`;else if (packageManager === 'yarn') command = `yarn remove ${name}`;
  return command;
};
/* Uninstall module */


let uninstallModule = ({
  name,
  dev
}, notify) => {
  if (dev) return;
  let command = getUninstallCommand(name);
  let message = `${name} removed`;
  let spinner = startSpinner(`Uninstalling ${name}`, 'red');
  runCommand(command, name, notify);
  stopSpinner(spinner, message, 'red');
};
/* Remove built in/native modules */


let removeBuiltInModules = modules => modules.filter(module => !isBuiltInModule(module.name));
/* Remove local files that are required */


let removeLocalFiles = modules => modules.filter(module => !module.name.includes('./'));
/* Remove file paths from module names
 * Example: convert `colors/safe` to `colors`
 */


let removeFilePaths = modules => {
  var _iterator4 = _createForOfIteratorHelper(modules),
      _step4;

  try {
    for (_iterator4.s(); !(_step4 = _iterator4.n()).done;) {
      let module = _step4.value;
      let slicedName = module.name.split('/')[0];
      if (slicedName.substr(0, 1) !== '@') module.name = slicedName;
    }
  } catch (err) {
    _iterator4.e(err);
  } finally {
    _iterator4.f();
  }

  return modules;
};
/* Filter registry modules */


let filterRegistryModules = modules => removeBuiltInModules(removeFilePaths(removeLocalFiles(modules)));
/* Get module names from array of module objects */


let getNamesFromModules = modules => modules.map(module => module.name);
/* Modules diff */


let diff = (first, second) => {
  let namesFromSecond = getNamesFromModules(second);
  return first.filter(module => !namesFromSecond.includes(module.name));
};
/* Reinstall modules */


let cleanup = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator(function* () {
    const cmd = yield whichPackageManager();
    let spinner = startSpinner('Cleaning up', 'green');

    if (cmd === 'npm' || cmd === 'pnpm' || cmd === 'yarn') {
      const args = [`${cmd} install`];
      runCommand(args);
    }

    stopSpinner(spinner);
  });

  return function cleanup() {
    return _ref4.apply(this, arguments);
  };
}();
/* Does package.json exist?
 * Without package.json, most of the functionality fails
 *     installing + adding to package.json
 *     removing unused modules
 */


let packageJSONExists = () => fs.existsSync('package.json');
/* Public helper functions */

/* Public helper functions */

/* Display Notifications */


const showNotification = message => {
  notifier.notify({
    title: 'Auto Installer Extension',
    message: message,
    open: 0,
    wait: false,
    sound: 'Pop'
  });
};

module.exports = {
  getInstalledModules,
  getUsedModules,
  filterRegistryModules,
  installModule,
  installModuleIfTrusted,
  uninstallModule,
  diff,
  cleanup,
  packageJSONExists,
  getFilesPath
};