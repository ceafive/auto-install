#!/usr/bin/env node

const helpers = require('./helpers');
const chokidar = require('chokidar');
const colors = require('colors');
const argv = require('yargs').argv;

let watchersInitialized = false;
let main;

/**
 * Arguments that can be passed to function when it is spawned eg. Nodejs child process, spawn
 */

/* Secure mode */
let secureMode = false;
if (argv.secure) secureMode = true;
if (argv['no-secure']) secureMode = false;

/* Show installation notifications */
let notifyMode = true;
if (argv.notify) notifyMode = true;
if (argv['no-notify']) notifyMode = false;

/* Auto uninstall modules  */
let uninstallMode = false;
if (argv.uninstall) uninstallMode = true;
if (argv['no-uninstall']) uninstallMode = false;

/* Watch files and repeat drill
 * Add a watcher, call main wrapper to repeat cycle
 */

let initializeWatchers = () => {
  let watcher = chokidar.watch(helpers.getFilesPath());
  watcher.on('change', main).on('unlink', main);

  watchersInitialized = true;
  console.log(colors.green('Watchers initialized'));
};

/* Main wrapper
 * Get installed modules from package.json
 * Get used modules from all files
 * Install used modules that are not installed
 * Remove installed modules that are not used
 * After setup, initialize watchers
 */

main = () => {
  if (!helpers.packageJSONExists()) {
    console.log(colors.red('package.json does not exist'));
    console.log(colors.red('You can create one by using `npm init`'));
    return;
  }

  let installedModules = [];
  installedModules = helpers.getInstalledModules();

  let usedModules = helpers.getUsedModules();
  usedModules = helpers.filterRegistryModules(usedModules);

  // removeUnusedModules

  if (uninstallMode) {
    let unusedModules = helpers.diff(installedModules, usedModules);
    for (let module of unusedModules)
      helpers.uninstallModule(module, notifyMode);
  }

  if (!watchersInitialized) initializeWatchers();
  helpers.cleanup();
  // installModules

  let modulesNotInstalled = helpers.diff(usedModules, installedModules);
  for (let module of modulesNotInstalled) {
    if (secureMode) helpers.installModuleIfTrusted(module, notifyMode);
    else helpers.installModule(module, notifyMode);
  }
};

/* Turn the key */
main();
