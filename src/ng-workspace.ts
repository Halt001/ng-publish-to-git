import { readFileSync } from 'fs';
import { commandLineArgs } from './argv';
// tslint:disable-next-line: no-var-requires
const path = require('path');


export type ProjectType = 'library'|'application';

export interface ProjectInfo {
  projectName: string;
  projectType: ProjectType;
  root: string;
  dest: string;
  version: string;
  repositoryUrl: string;
  publish: boolean;
  commitPrefix: string;
}

export interface NGLibProject {
  projectType: 'library';
  root: string;
  architect: {
    build: {
      options: {
        project: string;
      };
    };
  };
}

export interface NGAppProject {
  projectType: 'application';
  root: string;
  architect: {
    build: {
      options: {
        outputPath: string;
      };
    };
  };
}

export interface NGPackage {
  dest: string;
}

export interface NgPublishToGitPackageConfig {
  name: string;
  publish: boolean;
  repositoryUrl?: string;
  commitPrefix?: string;
}

export interface NgPublishToGitConfig {
  commitPrefix?: string;
  packages: NgPublishToGitPackageConfig[];
}

export interface PackageInfo {
  version: string;
  repository?: {
    type: string;
    url: string;
  };
  'ng-publish-to-git'?: NgPublishToGitConfig;
}

export function ngGetProjects(): ProjectInfo[] {
  const angularWorkspace = SafeJsonParse(readFileSync('angular.json', 'utf8'));

  if (!angularWorkspace) {
    console.warn('Error reading angular.json');

    return [];
  }

  const ngPublishToGitConfig: NgPublishToGitConfig = ngGetAppProjectPackageInfo('root')['ng-publish-to-git'];
  if (!ngPublishToGitConfig || !ngPublishToGitConfig.packages.length) {
    console.warn('No packages configured for publish. Add packages under "ng-publish-to-git" key to package.json');

    return [];
  }

  let projects: ProjectInfo[] = [];

  try {
    for (const projectName of Object.keys(angularWorkspace.projects)) {
      const ngProject: NGLibProject | NGAppProject = angularWorkspace.projects[projectName];
      throwOnInvalidProject(projectName, ngProject);

      const packagePublishInfo = ngPublishToGitConfig.packages.find(info => info.name === projectName);
      const publish = !!packagePublishInfo && packagePublishInfo.publish;
      const repositoryUrl = !!packagePublishInfo && packagePublishInfo.repositoryUrl;
      const commitPrefix = determineCommitPrefix(commandLineArgs.commitPrefix, ngPublishToGitConfig, projectName);

      const projectInfo: ProjectInfo = {
        projectName,
        projectType: ngProject.projectType,
        root: undefined,
        dest: undefined,
        version: undefined,
        publish: undefined,
        repositoryUrl,
        commitPrefix,
      };

      switch (projectInfo.projectType) {
        case 'library': {
          const ngLibProject = ngProject as NGLibProject;
          const ngPackageInfo = ngGetLibProjectPackageInfo(projectName, ngLibProject);
          throwOnInvalidLibProject(projectName, ngLibProject);

          projectInfo.root = ngLibProject.root;
          projectInfo.dest = ngGetDestinationFromLibProject(projectName, ngLibProject);
          projectInfo.version = ngPackageInfo.version;
          projectInfo.publish = publish;
          break;
        }

        case 'application': {
          const ngAppProject = ngProject as NGAppProject;
          const ngPackageInfo = ngGetAppProjectPackageInfo(projectName);

          throwOnInvalidAppProject(projectName, ngAppProject);
          projectInfo.root = ngAppProject.root;
          projectInfo.dest = ngAppProject.architect.build.options.outputPath;
          projectInfo.version = ngPackageInfo.version;

          projectInfo.publish = publish;
          break;
        }

        default:
          console.warn(`${projectName}: Skipping projects of type ${projectInfo.projectType}`);
          break;
      }

      projects.push(projectInfo);
    }
  } catch (error) {
    projects = [];
    console.error(error.description);
  }

  return projects;
}

export function determineCommitPrefix(
  commandLineCommitPrefix: string,
  ngPublishToGitConfig: NgPublishToGitConfig,
  projectName: string,
): string {
  let commitPrefix = commandLineCommitPrefix;
  if (commitPrefix !== undefined && commitPrefix !== null) {
    return commitPrefix;
  }

  if (ngPublishToGitConfig) {
    if (ngPublishToGitConfig.packages && ngPublishToGitConfig.packages.length) {
      const ngPublishToGitPackageConfig: NgPublishToGitPackageConfig =
        ngPublishToGitConfig.packages.find(packageConfig => packageConfig.name === projectName);

      commitPrefix = ngPublishToGitPackageConfig && ngPublishToGitPackageConfig.commitPrefix;
      if (commitPrefix !== undefined && commitPrefix !== null) {
        return commitPrefix;
      }
    }

    commitPrefix = ngPublishToGitConfig.commitPrefix;
    if (commitPrefix !== undefined && commitPrefix !== null) {
      return commitPrefix;
    }
  }

  return '';
}

export function SafeJsonParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch (error) {
    return null;
  }
}

function throwOnInvalidProject(projectname: string, ngProject: NGLibProject | NGAppProject) {
  if (!ngProject
    || !ngProject.projectType
    || !ngProject.root
    || !ngProject.architect
    || !ngProject.architect.build
    || !ngProject.architect.build.options
  ) {
    throw new Error(`${projectname}: Invalid library or application project structure: ${JSON.stringify(ngProject)}`);
  }
}

export function throwOnInvalidLibProject(projectname: string, ngLibProject: NGLibProject) {
  throwOnInvalidProject(projectname, ngLibProject);

  if (ngLibProject.projectType !== 'library' || !ngLibProject.architect.build.options.project) {
    throw new Error(`${projectname}: Invalid library project structure: ${JSON.stringify(ngLibProject)}`);
  }
}

export function throwOnInvalidAppProject(projectname: string, ngAppProject: NGAppProject) {
  throwOnInvalidProject(projectname, ngAppProject);

  if (ngAppProject.projectType !== 'application' || !ngAppProject.architect.build.options.outputPath) {
    throw new Error(`${projectname}: Invalid application project structure: ${JSON.stringify(ngAppProject)}`);
  }
}

export function throwOnInvalidAngularProjectSettings(projectName: string, angularProjectSettings: NGPackage) {
  if (!angularProjectSettings || !angularProjectSettings.dest) {
    throw new Error(`${projectName}: Could not determine destination directory`);
  }
}

export function throwOnInvalidPackageInfo(projectName: string, packageInfo: PackageInfo) {
  if (!packageInfo) {
    throw new Error(`${projectName}: Missing or Invalid package.json`);
  }

  if (!packageInfo.version) {
    throw new Error(`${projectName}: Missing version field in package.json content`);
  }

  if (packageInfo.repository && !(packageInfo.repository.type && packageInfo.repository.url)) {
    throw new Error(`${projectName}: Invalid repository field in package.json content`);
  }

  const ngPublishToGit = packageInfo['ng-publish-to-git'];
  if (ngPublishToGit) {
    if (!ngPublishToGit.packages) {
      throw new Error(`${projectName}: Invalid ng-publish-to-git field in package.json content. Missing packages field`);
    }

    ngPublishToGit.packages.forEach(ngPublishToGitPackage => {
      if (!ngPublishToGitPackage) {
        throw new Error(`${projectName}: Invalid ng-publish-to-git field in package.json content. Invalid package`);
      }

      if (!ngPublishToGitPackage.name) {
        throw new Error(`${projectName}: Invalid ng-publish-to-git field in package.json content. Invalid name field`);
      }

      if (ngPublishToGitPackage.publish !== false && ngPublishToGitPackage.publish !== true) {
        throw new Error(`${projectName}: Invalid ng-publish-to-git field in package.json content. Invalid publish field`);
      }
    });
  }

  if (!packageInfo
    || !packageInfo.version
    || (packageInfo.repository && !(packageInfo.repository.type && packageInfo.repository.url))
  ) {
    throw new Error(`${projectName}: Invalid package.json content`);
  }
}

export function ngGetProjectFileNameFromLibProject(projectName: string, ngProject: NGLibProject) {
  throwOnInvalidLibProject(projectName, ngProject);

  return ngProject.architect.build.options.project;
}

export function ngGetDestinationFromProjectFile(projectName: string, projectFilename: string): string {
  const angularProjectSettings: NGPackage = SafeJsonParse(readFileSync(projectFilename, 'utf8'));

  throwOnInvalidAngularProjectSettings(projectName, angularProjectSettings);

  const projectDir: string = path.dirname(projectFilename);
  const resolvedDest: string = path.join(projectDir, angularProjectSettings.dest);

  return resolvedDest;
}

export function ngGetDestinationFromLibProject(projectName: string, ngProject: NGLibProject): string {
  const projectFilename = ngGetProjectFileNameFromLibProject(projectName, ngProject);

  return ngGetDestinationFromProjectFile(projectName, projectFilename);
}

export function ngGetLibProjectPackageInfo(projectName: string, ngLibProject: NGLibProject): PackageInfo {
  throwOnInvalidLibProject(projectName, ngLibProject);

  const packageFilename: string = path.join(ngLibProject.root, 'package.json');
  const packageInfo: PackageInfo = SafeJsonParse(readFileSync(packageFilename, 'utf8'));

  if (!packageInfo) {
    throw new Error(`${projectName}: Error reading package file: ${packageFilename}`);
  }

  throwOnInvalidPackageInfo(projectName, packageInfo);

  return packageInfo;
}

export function ngGetAppProjectPackageInfo(projectName: string): PackageInfo {
  const packageFilename = './package.json';
  const packageInfo: PackageInfo = SafeJsonParse(readFileSync(packageFilename, 'utf8'));

  if (!packageInfo) {
    throw new Error(`${projectName}: Error reading package file: ${packageFilename}`);
  }

  throwOnInvalidPackageInfo(projectName, packageInfo);

  return packageInfo;
}

