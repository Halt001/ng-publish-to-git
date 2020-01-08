import tmp, { DirOptions, DirCallback } from 'tmp';
import { promisify } from 'util';
import { mapSeries, asyncify } from 'async';
import tar from 'tar';
import fs from 'fs';

// tslint:disable-next-line: no-var-requires
const path = require('path');

import { ProjectInfo } from './ng-workspace';
import { git } from './git';

// this makes adding spies in the unit test possible
import * as thisModule from './ng-publish';
import { npmBumpPatchVersion, npmPack } from './npm';
import { execProcess } from './process';

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



tmp.setGracefulCleanup();
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
    return Promise.reject(new Error(`Working directory is not clean`));
  }

  const { projectName, version } = projectInfo;

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
    await thisModule.stageAllAndCommit(commitMessage);

    await thisModule.ngPublish({ ...projectInfo, version: newVersion });
    publishResult.publishState = PublishState.PublishedVersionBumped;
    publishResult.newVersion = newVersion;
  }

  return publishResult;
}

export async function ngPublish(projectInfo: ProjectInfo): Promise<void> {
  const { projectName, version, repositoryUrl, dest } = projectInfo;

  await thisModule.ngBuildProject(projectName);
  await thisModule.tagProjectVersion(projectName, version);
  await thisModule.pushChangesAndTags();

  const tmpRepoDir = await createTmpRepo(repositoryUrl);
  await thisModule.packIntoTmpRepo(dest, tmpRepoDir);
  const tag = await thisModule.commitAndTagTmpRepo(projectName, version, tmpRepoDir);
  await thisModule.pushTmpRepo(repositoryUrl, tag, tmpRepoDir);
}

export async function workingDirIsClean(): Promise<boolean> {
  return !(await git(['status', '--porcelain'])).trim().length;
}

export async function createTmpRepo(packageRepositoryUrl: string): Promise<string> {
  const tmpRepoDir = await thisModule.dirAsync({ unsafeCleanup : false, prefix: 'tmp_ng-publish-to-git_' });
  await git(['init'], tmpRepoDir);
  await git(['remote', 'add', 'package-repo', packageRepositoryUrl], tmpRepoDir);

  return tmpRepoDir;
}

export async function commitAndTagTmpRepo(projectName: string, version: string, repoDir: string): Promise<string> {
  const message = `Published ${projectName}@v${version} with ng-publish-to-git`;
  const tag = 'v' + version;

  await git(['add', '.'], repoDir);
  await git(['commit', '-m', message], repoDir);
  await git(['tag', 'v' + version, '-m', message], repoDir);

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

export async function commit(commitMessage: string): Promise<void> {
  await git(['commit', '-m', commitMessage]);
}

export async function stageFiles(pathSpec: string): Promise<void> {
  await git(['add', pathSpec]);
}

export async function stageAllAndCommit(commitMessage: string): Promise<void> {
  await thisModule.stageFiles('.');
  await thisModule.commit(commitMessage);
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
  await execProcess('ng', ['build', projectName], { verbose: false });
}
