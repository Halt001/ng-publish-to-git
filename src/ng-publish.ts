import tmp, { DirOptions, DirCallback } from 'tmp';
import { promisify } from 'util';
import { mapSeries, asyncify } from 'async';
import tar from 'tar';
import fs from 'fs';
import { exec } from 'child_process';

// tslint:disable-next-line: no-var-requires
const path = require('path');

import { commandLineArgs } from './argv';
import { ProjectInfo } from './ng-workspace';
import { git } from './git';


// this makes adding spies in the unit test possible
import * as thisModule from './ng-publish';
import { npmBumpPatchVersion, npmPack } from './npm';
import { execProcess, isWindowsPlatform } from './process';
import chalk from 'chalk';

export enum PublishState {
  NotPublishedDisabled = 0,
  NotPublishedNoChange = 1,
  PublishedCurrentVersion = 2,
  PublishedVersionBumped = 3,
}

export interface PublishResult {
  projectName: string;
  version: string;
  newVersion?: string;
  publishState: PublishState;
}

if (!commandLineArgs.debug) {
  tmp.setGracefulCleanup();
}

export const dirAsync = promisify(tmp.dir as (options: DirOptions, cb: DirCallback) => void);
export const unlinkAsync = promisify(fs.unlink);

export async function ngPublishAllIfChanged(projectInfos: ProjectInfo[]): Promise<PublishResult[]> {
  return new Promise<PublishResult[]>((resolve: any, reject: any) => {
    mapSeries(projectInfos, asyncify(async (projectInfo: ProjectInfo) => thisModule.ngPublishIfChanged(projectInfo)),
      (error, results) => {
        error
          ? reject(error)
          : resolve(results);
      },
    );
  });
}

export async function ngPublishIfChanged(projectInfo: ProjectInfo): Promise<PublishResult> {
  if (!projectInfo) {
    return Promise.reject(new Error('Invalid project (NULL)'));
  }

  if (!await thisModule.workingDirIsClean()) {
    return Promise.reject(new Error(`You have uncommitted changes, please commit or remove your changes first`));
  }

  const { projectName, version, commitPrefix } = projectInfo;

  const publishResult: PublishResult = {
    projectName,
    version,
    publishState: PublishState.NotPublishedNoChange,
  };

  if (!projectInfo.publish) {
    publishResult.publishState = PublishState.NotPublishedDisabled;

    return publishResult;
  }

  const existingTags = await thisModule.ngProjectGetPublishTags(projectName);
  const tagFromProjectVersion = makeProjectTag(projectName, version);
  const tagAlreadyExists = existingTags.includes(tagFromProjectVersion);

  if (!tagAlreadyExists) {
    await thisModule.ngPublish(projectInfo);
    publishResult.publishState = PublishState.PublishedCurrentVersion;

    return publishResult;
  }

  const hasChanges = await thisModule.ngProjectHasChangesSinceTag(projectInfo, tagFromProjectVersion);

  if (hasChanges) {
    const newVersion = await npmBumpPatchVersion(projectInfo.root);
    const commitMessage = `ng-publish-to-git updated ${projectInfo.projectName} to version v${newVersion}`;
    await thisModule.stageAllAndCommit(commitPrefix, commitMessage);

    await thisModule.ngPublish({ ...projectInfo, version: newVersion });
    publishResult.publishState = PublishState.PublishedVersionBumped;
    publishResult.newVersion = newVersion;
  }

  return publishResult;
}

export async function ngPublish(projectInfo: ProjectInfo): Promise<void> {
  const { projectName, version, repositoryUrl, dest, commitPrefix, prePublishToGit } = projectInfo;

  await thisModule.ngBuildProject(projectName);

  // Execute a prePublishToGit script if present in the package.json config
  if (prePublishToGit) {
    const prePublishToGitResult = await executePrePublishToGit(prePublishToGit);
    console.log(chalk.dim(prePublishToGitResult));
  }

  await thisModule.tagProjectVersion(projectName, version);
  await thisModule.pushChangesAndTags();

  const tmpRepoDir = await createTmpRepo(repositoryUrl);
  await thisModule.packIntoTmpRepo(dest, tmpRepoDir);
  const tag = await thisModule.commitAndTagTmpRepo(projectName, version, commitPrefix, tmpRepoDir);
  await thisModule.pushTmpRepo(repositoryUrl, tag, tmpRepoDir);
}

export async function executePrePublishToGit(prePublishToGitCommand: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const prePublishToGitCommandInfo = 'Executing prePublishToGit with command: ' + prePublishToGitCommand + '\n';

    exec(prePublishToGitCommand,
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(prePublishToGitCommandInfo + `Error prePublishToGit failed with error: ${error}`));
          return;
        }

        resolve(prePublishToGitCommandInfo + 'Completed prePublishToGit');
      });
  });
}

export async function workingDirIsClean(): Promise<boolean> {
  return !(await git(['status', '--porcelain'])).trim().length;
}

export async function createTmpRepo(packageRepositoryUrl: string): Promise<string> {
  const unsafeCleanup = !commandLineArgs.debug;
  const tmpRepoDir = await thisModule.dirAsync({ unsafeCleanup, prefix: 'tmp_ng-publish-to-git_' });

  if (commandLineArgs.debug) {
    // tslint:disable-next-line: no-console
    console.log('Temp dir: ', chalk.bgRedBright.whiteBright(tmpRepoDir));
  }

  await git(['init'], tmpRepoDir);
  await git(['remote', 'add', 'package-repo', packageRepositoryUrl], tmpRepoDir);

  return tmpRepoDir;
}

export async function commitAndTagTmpRepo(projectName: string, version: string, commitPrefix: string, repoDir: string): Promise<string> {
  const tag = 'v' + version;
  const tagMessage = `Published ${projectName}@${tag} with ng-publish-to-git`;
  const commitMessage = prefixCommitMessage(commitPrefix, tagMessage);

  await git(['add', '.'], repoDir);
  await git(['commit', '-m', commitMessage], repoDir);
  await git(['tag', 'v' + version, '-m', tagMessage], repoDir);

  return tag;
}

export async function packIntoTmpRepo(sourceDir: string, repoDir: string): Promise<void> {
  const sourceDirAbsolute = path.resolve(sourceDir);
  const packageTarballName = await npmPack(sourceDirAbsolute, repoDir);
  const packageTarballNameAbsolute = path.join(path.resolve(repoDir), packageTarballName);

  const extractAsync: (options: tar.ExtractOptions & tar.FileOptions, fileList?: ReadonlyArray<string>) => Promise<void> = tar.extract;

  const extractOptions: tar.ExtractOptions & tar.FileOptions = {
    strip: 1,
    cwd: repoDir,
    file: packageTarballNameAbsolute,
  };

  try {
    await extractAsync(extractOptions);
  } finally {
    await thisModule.unlinkAsync(packageTarballNameAbsolute);
  }
}

export async function pushTmpRepo(packageRepositoryUrl: string, tag: string, repoDir: string): Promise<void> {
  await git(['push', packageRepositoryUrl, tag], repoDir);
}

export async function commit(commitPrefix: string, commitMessage: string): Promise<void> {
  const message = prefixCommitMessage(commitPrefix, commitMessage);
  await git(['commit', '-m', message]);
}

export async function stageFiles(pathSpec: string): Promise<void> {
  await git(['add', pathSpec]);
}

export async function stageAllAndCommit(commitPrefix: string, commitMessage: string): Promise<void> {
  await thisModule.stageFiles('.');
  await thisModule.commit(commitPrefix, commitMessage);
}

export async function tagProjectVersion(projectName: string, version: string): Promise<void> {
  const tag = makeProjectTag(projectName, version);
  await git(['tag', tag, '-m', `ng-publish-to-git tagged ${projectName} with ${version}`]);
}

export async function pushChangesAndTags(): Promise<void> {
  await git(['push', '--follow-tags']);
}

export async function ngProjectGetPublishTags(projectName: string): Promise<string[]> {
  return (await git(['tag']))
    .split('\n')
    .map(tag => {
      const splitParts = splitProjectTag(tag);

      return splitParts && splitParts.projectName === projectName
        ? tag
        : null;
    })
    .filter(tag => !!tag);
}

export async function ngProjectHasChangesSinceTag(projectInfo: ProjectInfo, tag: string): Promise<boolean> {
  const gitOutput = await git(['diff', '--name-only', tag, '--', projectInfo.root]);

  return gitOutput.split('\n').filter(dir => !!dir).length > 0;
}

export function makeProjectTag(name: string, version: string): string {
  return `${name}@v${version}`;
}

export function splitProjectTag(tag: string): { projectName: string, version: string } {
  const indexName = 1;
  const indexVersion = 2;
  const groups = tag.match(/(.+)@v(\d+.\d+.\d+)/);

  return groups
    ? {
      projectName: groups[indexName],
      version: groups[indexVersion],
    }
    : null;
}

export async function ngBuildProject(projectName: string): Promise<void> {
  const ngProcessName = isWindowsPlatform()
    ? 'ng.cmd'
    : 'ng';

  await execProcess(ngProcessName, ['build', projectName], { verbose: false });
}

function prefixCommitMessage(commitPrefix: string, message: string): string {
  return commitPrefix
    ? commitPrefix + ' ' + message
    : message;
}
