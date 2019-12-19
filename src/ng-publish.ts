import tmp from 'tmp';
import { promisify } from 'util';

import { ProjectInfo } from './ng-workspace';
import { git } from './git';

// this makes adding spies in the unit test possible
import * as thisModule from './ng-publish';
import { npmBumpPatchVersion } from './npm';

tmp.setGracefulCleanup();
const dirAsync = promisify(tmp.dir);

export async function ngPublishIfChanged(projectInfo: ProjectInfo): Promise<string> {
  if (!projectInfo) {
    return Promise.reject(new Error('Invalid project (NULL)'));
  }

  if (!projectInfo.publish) {
    return Promise.reject(new Error(`Project ${projectInfo.name} has publish disabled`));
  }

  const existingTags = await thisModule.ngProjectGetPublishTags(projectInfo.name);
  const tagFromProjectVersion = makeProjectTag(projectInfo.name, projectInfo.version);
  const tagAlreadyExists = existingTags.includes(tagFromProjectVersion);

  if (!tagAlreadyExists) {
    return thisModule.ngPublish(projectInfo);
  }

  const hasChanghes = await thisModule.ngProjectHasChangesSinceTag(projectInfo, tagFromProjectVersion);

  if (hasChanghes) {
    const version = await npmBumpPatchVersion(projectInfo.dest);

    return thisModule.ngPublish({ ...projectInfo, version });
  }

  return `Project: ${projectInfo.name} package is already up to date at version: ${projectInfo.version} and does not need to be published`;
}

export async function ngPublish(projectInfo: ProjectInfo): Promise<string> {
  return 'done';
}

// export function semVerIncreasePatch(version: string): string {
//   const groups = version.match(/(\d+.\d+.)(\d+)/);
//   if (!groups) {
//     return null;
//   }

//   const indexBeforePatch = 1;
//   const indexPatch = 2;
//   const newPatch = +groups[indexPatch] + 1;

//   return groups[indexBeforePatch] + newPatch.toString();
// }

export async function workingDirIsClean(): Promise<boolean> {
  return !(await git(['status', '--porcelain'])).trim().length;
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
