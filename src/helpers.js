const fs = require('fs');
const glob = require('glob');
const { execSync } = require('child_process');
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
let readFile = (path) => {
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

  for (let key of Object.keys(dependencies)) {
    installedModules.push({
      name: key,
      dev: false
    });
  }
  for (let key of Object.keys(devDependencies)) {
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
  const path1 = glob.sync('**/*.js', { ignore: ['**/node_modules/**/*'] });
  // const path4 = glob.sync("**/*.ts", { ignore: ['**/node_modules/**/*'] });
  const path2 = glob.sync('**/*.jsx', { ignore: ['**/node_modules/**/*'] });
  const path3 = glob.sync('**/*.vue', { ignore: ['**/node_modules/**/*'] });
  return path1.concat(path2, path3);
};

/* Check for valid string - to stop malicious intentions */

const isValidModule = (name) => {
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

  walker.walk(src, (node) => {
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

const getModulesFromFile = (path) => {
  const content = fs.readFileSync(path, 'utf8');
  let output = '';
  if (path.endsWith('.vue')) {
    if (compiler.parseComponent(content).script)
      output = compiler.parseComponent(content).script.content;
  } else output = content;

  // return output;
  let allModules = [];

  //set options for babel parser used in detective module
  const detectiveOptions = {
    sourceType: 'module',
    errorRecovery: true,
    allowImportExportEverywhere: true
  };
  try {
    //sniff file for ES6 import statements
    allModules = detective(output, detectiveOptions);
    // filter modules;
    allModules = allModules.filter((module) => isValidModule(module));
  } catch (err) {
    const line = content.split('\n')[err.loc.line - 1];
    const error = `Babel parser error. Could not parse '${path}'. There is a syntax error in file at line ${err.loc.line} column: ${err.loc.column}\ncausing all modules used in this file ONLY to be uninstalled`;
    handleError(error);
  }

  // return filtered modules;
  allModules = allModules.filter((module) => isValidModule(module));
  return allModules;
};

/* Is test file?
 * [.spec.js, .test.js] are supported test file formats
 */

let isTestFile = (name) =>
  name.endsWith('.spec.js') || name.endsWith('.test.js');

/* Dedup similar modules
 * Deduplicates list
 * Ignores/assumes type of the modules in list
 */

let deduplicateSimilarModules = (modules) => {
  let dedupedModules = [];
  let dedupedModuleNames = [];

  for (let module of modules) {
    if (!dedupedModuleNames.includes(module.name)) {
      dedupedModules.push(module);
      dedupedModuleNames.push(module.name);
    }
  }

  return dedupedModules;
};

/* Dedup modules
 * Divide modules into prod and dev
 * Deduplicates each list
 */

let deduplicate = (modules) => {
  let dedupedModules = [];

  let testModules = modules.filter((module) => module.dev);
  dedupedModules = dedupedModules.concat(
    deduplicateSimilarModules(testModules)
  );

  let prodModules = modules.filter((module) => !module.dev);
  dedupedModules = dedupedModules.concat(
    deduplicateSimilarModules(prodModules)
  );

  return dedupedModules;
};

/* Get used modules
 * Read all .js files and grep for modules
 */

const getUsedModules = () => {
  //grab all files matching extensions programmed in "getFilesPath" function
  const filesPath = getFilesPath();
  let usedModules = [];
  //loop through returned 'filesPath' array
  for (const filePath of filesPath) {
    // Sniff each file for modules used in file
    let modulesFromFile = getModulesFromFile(filePath);
    //check and set set 'dev' key on file extenstion matching ".test.js" or ".spec.js"
    const dev = isTestFile(filePath);
    for (const name of modulesFromFile) usedModules.push({ name, dev });
  }

  usedModules = deduplicate(usedModules);
  return usedModules;
};

/* Handle error
 * Pretty error message for common errors
 */

let handleError = (err) => {
  if (err.includes('E404')) {
    console.log(colors.red('Module is not in the npm registry.'));
  } else if (err.includes('ENOTFOUND')) {
    console.log(
      colors.red('Could not connect to npm, check your internet connection!')
    );
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
    execSync(command, { encoding: 'utf8' });
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
  if (type === 'red') symbol = logSymbols.error;
  else if (type === 'yellow') symbol = logSymbols.warning;
  else symbol = logSymbols.success;
  console.log(symbol, message);
};

/* Is module popular? - for secure mode */

const POPULARITY_THRESHOLD = 10000;
let isModulePopular = (name, callback) => {
  let spinner = startSpinner(`Checking ${name}`, 'yellow');
  let url = `https://api.npmjs.org/downloads/point/last-month/${name}`;
  https
    .get(url)
    .then((response) => {
      let body = '';
      response.on('data', (data) => {
        body += data;
      });

      response.on('end', () => {
        stopSpinner(spinner);
        let downloads = JSON.parse(body).downloads;
        callback(downloads > POPULARITY_THRESHOLD);
      });
    })
    .catch((error) => {
      console.log(
        colors.red('Could not connect to npm, check your internet connection!'),
        error
      );
    });
};

/* Get package manager used
 *
 */
const whichPackageManager = async () => {
  try {
    const res = await whichpm(process.cwd());
    return res.name;
  } catch (err) {
    return handleError(err);
  }
};

/* Get install command
 *
 * Depends on package manager, dev and exact
 */

let getInstallCommand = async (name, dev) => {
  const packageManager = await whichPackageManager();
  let command;

  if (packageManager === 'npm') {
    command = `npm install ${name} --save`;
    if (dev) command += '-dev';
    if (argv.exact) command += ' --save-exact';
  } else if (packageManager === 'yarn') {
    command = `yarn add ${name}`;
    if (dev) command += ' --dev';
    // yarn always adds exact
  }
  return command;
};

let isScopedModule = (name) => name[0] === '@';
/* Install module
 * Install given module
 */

const beginInstallModule = async (name, dev, notify) => {
  let spinner = startSpinner(`Installing '${name}'`, 'green');
  let command = await getInstallCommand(name, dev);
  let message = `'${name}' installed`;
  if (dev) message += ' in devDependencies';

  let success = runCommand(command, name, notify);
  if (success) stopSpinner(spinner, message, 'green');
  else stopSpinner(spinner, `'${name}' installation failed`, 'yellow');
};

const installModule = ({ name, dev }, notify) => {
  if (isScopedModule(name)) {
    packageJson(name)
      .then(() => {
        beginInstallModule(name, dev, notify);
      })
      .catch(() => {});
  } else {
    beginInstallModule(name, dev, notify);
  }
};

/* is scoped module? */

/* Install module if author is trusted */

let installModuleIfTrustedAuthor = ({ name, dev }, notify) => {
  let trustedAuthor = argv['trust-author'];
  packageJson(name).then((json) => {
    if (json.author && json.author.name === trustedAuthor) {
      installModule({ name, dev }, notify);
    } else console.log(colors.red(`${name} not trusted`));
  });
};

const installIfPopular = ({ name, dev }, notify) => {
  isModulePopular(name, (popular) => {
    // Popular as proxy for trusted
    if (popular) installModule({ name, dev }, notify);
    // Trusted Author
    else if (argv['trust-author']) {
      installModuleIfTrustedAuthor({ name, dev }, notify);
    }
    // Not trusted
    else console.log(colors.red(`'${name}' not trusted`));
  });
};

/* Install module if trusted
 * Call isModulePopular before installing
 */

let installModuleIfTrusted = ({ name, dev }, notify) => {
  // Trust scoped modules
  if (isScopedModule(name)) {
    packageJson(name)
      .then(() => {
        installIfPopular({ name, dev }, notify);
      })
      .catch((err) => {
        // handleError(err.message);
      });
  } else {
    installIfPopular({ name, dev }, notify);
  }
};

/* Get uninstall command
 *
 * Depends on package manager
 */

let getUninstallCommand = (name) => {
  let packageManager = 'npm';
  if (argv.yarn) packageManager = 'yarn';

  let command;

  if (packageManager === 'npm') command = `npm uninstall ${name} --save`;
  else if (packageManager === 'yarn') command = `yarn remove ${name}`;

  return command;
};

/* Uninstall module */

let uninstallModule = ({ name, dev }, notify) => {
  if (dev) return;

  let command = getUninstallCommand(name);
  let message = `${name} removed`;

  let spinner = startSpinner(`Uninstalling ${name}`, 'red');
  runCommand(command, name, notify);
  stopSpinner(spinner, message, 'red');
};

/* Remove built in/native modules */

let removeBuiltInModules = (modules) =>
  modules.filter((module) => !isBuiltInModule(module.name));

/* Remove local files that are required */

let removeLocalFiles = (modules) =>
  modules.filter((module) => !module.name.includes('./'));

/* Remove file paths from module names
 * Example: convert `colors/safe` to `colors`
 */

let removeFilePaths = (modules) => {
  for (let module of modules) {
    let slicedName = module.name.split('/')[0];
    if (slicedName.substr(0, 1) !== '@') module.name = slicedName;
  }
  return modules;
};

/* Filter registry modules */

let filterRegistryModules = (modules) =>
  removeBuiltInModules(removeFilePaths(removeLocalFiles(modules)));

/* Get module names from array of module objects */

let getNamesFromModules = (modules) => modules.map((module) => module.name);

/* Modules diff */

let diff = (first, second) => {
  let namesFromSecond = getNamesFromModules(second);
  return first.filter((module) => !namesFromSecond.includes(module.name));
};

/* Reinstall modules */

let cleanup = async () => {
  const cmd = await whichPackageManager();
  let spinner = startSpinner('Cleaning up', 'green');
  if (cmd === 'npm' || cmd === 'pnpm' || cmd === 'yarn') {
    const args = [`${cmd} install`];
    runCommand(args);
  }
  stopSpinner(spinner);
};

/* Does package.json exist?
 * Without package.json, most of the functionality fails
 *     installing + adding to package.json
 *     removing unused modules
 */

let packageJSONExists = () => fs.existsSync('package.json');

/* Public helper functions */

/* Public helper functions */

/* Display Notifications */

const showNotification = (message) => {
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
