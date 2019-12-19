#!/usr/bin/env node
import { ngGetProjects } from './ng-workspace';
import { git } from './git';
import { ngProjectGetPublishTags, ngProjectHasChangesSinceTag, workingDirIsClean } from './ng-publish';
import { npmBumpPatchVersion } from './npm';

// // tslint:disable-next-line: no-console
// console.log('Hello from ng-publish-git via link2');
// const projects = ngGetProjects();

// // tslint:disable-next-line: no-console
// projects.forEach(project => console.log(project));

// // tslint:disable-next-line: no-console
// git(['init'], '/Users/tim/Downloads/gittest')
//   .then(output => console.log('Output: ', output))
//   // tslint:disable-next-line: no-console
//   .catch(err => console.log('Error:', err));

// npmBumpPatchVersion('./tmp').then((version: string) => console.log(`NewVer:[${version}]`));

workingDirIsClean().then((isClean: boolean) => console.log(`isClean:[${isClean}]`));