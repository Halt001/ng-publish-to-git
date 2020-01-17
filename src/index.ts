#!/usr/bin/env node
// tslint:disable: no-console
import chalk from 'chalk';
const packageJson = require('../package.json');

import { ProjectInfo, ngGetProjects, ngFilterProjectsWithCommandLineOptions } from './ng-workspace';
import { PublishResult, PublishState, ngPublishAllIfChanged } from './ng-publish';
import { processCommandLineArguments, commandLineArgs } from './argv';
import { banner } from './banner';

const displayBanner = (): void => {
  console.log(banner);
  console.log(`(Version: ${chalk.yellow(packageJson.version)})\n\n`);
};

const longestProjectNameLength = (projects: ProjectInfo[]): number => {
  return projects.reduce((maxLen, projectInfo) => Math.max(maxLen, projectInfo.projectName.length), 0);
};

const logResult = (publishResult: PublishResult, maxNameLen: number) => {
  const { projectName, version, newVersion, publishState } = publishResult;
  const formattedProjectName = projectName.padEnd(maxNameLen, ' ');

  let msg = chalk.blue(formattedProjectName + ': ');
  switch (publishState) {
    case PublishState.NotPublishedDisabled:
      msg += chalk.dim('publish disabled');
      break;

    case PublishState.NotPublishedNoChange:
      msg += 'No changes found, not published';
      break;

    case PublishState.PublishedCurrentVersion:
      msg += `Published with version: ${chalk.green('v' + version)}`;
      break;

    case PublishState.PublishedVersionBumped:
        msg += `Published with version bumped: ${chalk.green('v' + version + ' -> ' + 'v' + newVersion)}`;
        break;

    default:
      msg += '?';
      break;
  }

  console.log(msg);
};

// mechanism to prevent NodeJs from exiting before the result promise is resolved
const timeOut = 1800000; /* 30 minutes in ms */
const keepNodeAliveTimer: NodeJS.Timeout = setTimeout(() => keepNodeAliveTimer.unref(), timeOut);
const stopWaitingAndExit = () => keepNodeAliveTimer.unref();

(async () => {
  try {
    displayBanner();
    processCommandLineArguments();

    if (commandLineArgs.debug) {
      console.log('Debug option:', chalk.green('enabled'));
    }

    if (commandLineArgs.package) {
      console.log('Single project selected for publishing:', chalk.green(commandLineArgs.package));
    }

    const allProjects = ngGetProjects();
    const projects = ngFilterProjectsWithCommandLineOptions(allProjects, commandLineArgs);

    if (!projects.length) {
      if (commandLineArgs.package) {
        throw new Error(`Project: ${commandLineArgs.package} not found`);
      } else {
        throw new Error(chalk.red(`No projects configured for publishing`));
      }
    }

    const results = await ngPublishAllIfChanged(projects);
    const maxNameLen = longestProjectNameLength(projects);

    console.log();
    results.map(result => logResult(result, maxNameLen));
    console.log();
  } catch (error) {
    commandLineArgs.debug
      ? console.error(error)
      : console.log(chalk.red(error.message));
  } finally {
    stopWaitingAndExit();
  }
})();
