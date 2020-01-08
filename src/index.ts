#!/usr/bin/env node
import { ngGetProjects, ProjectInfo } from './ng-workspace';
import { PublishResult, PublishState, ngPublishAllIfChanged } from './ng-publish';
import chalk from 'chalk';


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

  // tslint:disable-next-line: no-console
  console.log(msg);
};

// mechanism to prevent NodeJs from exiting before the result promise is resolved
const timeOut = 1800000; /* 30 minutes in ms */
const keepNodeAliveTimer: NodeJS.Timeout = setTimeout(() => keepNodeAliveTimer.unref(), timeOut);
const stopWaitingAndExit = () => keepNodeAliveTimer.unref();

(async () => {
  const projects = ngGetProjects();
  const results = await ngPublishAllIfChanged(projects);
  const maxNameLen = longestProjectNameLength(projects);

  // tslint:disable-next-line: no-console
  console.log();
  results.map(result => logResult(result, maxNameLen));
  // tslint:disable-next-line: no-console
  console.log();
  stopWaitingAndExit();
})();
