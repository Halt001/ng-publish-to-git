// tslint:disable: no-magic-numbers max-file-line-count
import fs from 'fs';
import { CommandLineArgs } from '../src/argv';

import { ngGetDestinationFromProjectFile, NGLibProject, NGAppProject,
  ngGetDestinationFromLibProject, ngGetProjectFileNameFromLibProject,
  ngGetProjects, SafeJsonParse, throwOnInvalidLibProject, throwOnInvalidAppProject, throwOnInvalidAngularProjectSettings,
  NGPackage, PackageInfo, throwOnInvalidPackageInfo, ngGetLibProjectPackageInfo, ngGetAppProjectPackageInfo,
  determineCommitPrefix, NgPublishToGitConfig, NgPublishToGitPackageConfig, ngFilterProjectsWithCommandLineOptions  } from '../src/ng-workspace';


jest.mock('fs');

describe('ng-workspace', () => {
  beforeAll(() => {
    (fs.readFileSync as any).mockImplementation((filename: string, _encoding: string) => {
      if (filename === 'package.json') {
        return `{ "version": "1.2.3" }`;
      }
      if (filename === 'angular.json') {
        return `{
          "projects": {
            "lib1": {
              "projectType": "library",
              "root": "projects/lib1",
              "architect": {
                "build": {
                  "options": {
                    "project": "projects/lib1/ng-package.json"
                  }
                }
              }
            },
            "lib2": {
              "projectType": "library",
              "root": "projects/lib2",
              "architect": {
                "build": {
                  "options": {
                    "project": "projects/lib2/ng-package.json"
                  }
                }
              }
            },
            "app": {
              "projectType": "application",
              "root": "projects/app",
              "architect": {
                "build": {
                  "options": {
                    "outputPath": "dist/app"
                  }
                }
              }
            }
          }
        }`;
      }

      if (filename === 'projects/lib1/ng-package.json') {
        return `{ "dest": "../../dist/lib1" }`;
      }

      if (filename === 'projects/lib2/ng-package.json') {
        return `{ "dest": "../../dist/lib2" }`;
      }

      if (filename === 'projects/lib1/package.json') {
        return `{
          "version": "2.3.4",
          "repository": {
            "type": "git",
            "url": "ssh://git@some-repo/lib1.git"
          }
        }`;
      }

      if (filename === 'projects/lib2/package.json') {
        return `{
          "version": "3.4.5",
          "repository": {
            "type": "git",
            "url": "ssh://git@some-repo/lib2.git"
          }
        }`;
      }

      if (filename === './package.json') {
        return `{
          "version": "1.2.3",
          "repository": {
            "type": "git",
            "url": "ssh://git@some-repo/app.git"
          },
          "ng-publish-to-git": {
            "commitPrefix": "GLOBAL-PREFIX",
            "packages": [
              {
                "name": "lib1",
                "publish": true,
                "repositoryUrl": "https://some-repo.git"
              },
              {
                "name": "app",
                "commitPrefix": "APP-PREFIX",
                "publish": false
              }
            ]
          }
        }`;
      }
    });
  });

  describe('ngGetProjects', () => {
    it('ngGetProjects should return all libs and apps', () => {
      // act
      const projects = ngGetProjects();

      // assert
      expect(projects.length).toEqual(3);
      expect(projects[0].projectName).toBe('lib1');
      expect(projects[0].projectType).toBe('library');
      expect(projects[0].root).toBe('projects/lib1');
      expect(projects[0].dest).toBe('dist/lib1');
      expect(projects[0].version).toBe('2.3.4');
      expect(projects[0].commitPrefix).toBe('GLOBAL-PREFIX');
      expect(projects[0].publish).toBe(true);

      expect(projects[1].projectName).toBe('lib2');
      expect(projects[1].projectType).toBe('library');
      expect(projects[1].root).toBe('projects/lib2');
      expect(projects[1].dest).toBe('dist/lib2');
      expect(projects[1].version).toBe('3.4.5');
      expect(projects[1].commitPrefix).toBe('GLOBAL-PREFIX');
      expect(projects[1].publish).toBe(false);

      expect(projects[2].projectName).toBe('app');
      expect(projects[2].projectType).toBe('application');
      expect(projects[2].root).toBe('projects/app');
      expect(projects[2].dest).toBe('dist/app');
      expect(projects[2].version).toBe('1.2.3');
      expect(projects[2].commitPrefix).toBe('APP-PREFIX');
      expect(projects[2].publish).toBe(false);
    });
  }); // describe ngGetProjects

  describe('SafeJsonParse', () => {
    it ('should parse a valid JSON string', () => {
      expect(SafeJsonParse('{ "foo": "bar" }')).toEqual({ foo: 'bar' });
    });

    it ('should return null for an invalid JSON string', () => {
      expect(SafeJsonParse('')).toBeNull();
    });
  }); // describe SafeJsonParse

  describe('throwOnInvalidLibProject', () => {
    it('should not throw on a valid lib project', () => {
      // arrange
      const ngLibProject: NGLibProject = {
        projectType: 'library',
        root: 'projects/lib1',
        architect: {
          build: {
            options: {
              project: 'projects/lib1/ng-package.json',
            },
          },
        },
      };

      expect(() => throwOnInvalidLibProject('lib1', ngLibProject)).not.toThrow();
    });

    it('should throw on a null', () => {
      expect(() => throwOnInvalidLibProject('lib1', null)).toThrow();
    });

    it('should throw on invalid projectType', () => {
      // arrange
      const ngLibProject: NGLibProject = {
        projectType: 'application' as any,
        root: 'projects/lib1',
        architect: {
          build: {
            options: {
              project: 'projects/lib1/ng-package.json',
            },
          },
        },
      };

      expect(() => throwOnInvalidLibProject('lib1', ngLibProject)).toThrow();
    });

    it('should throw on undefined projectType', () => {
      // arrange
      const ngLibProject: NGLibProject = {
        projectType: undefined,
        root: 'projects/lib1',
        architect: {
          build: {
            options: {
              project: 'projects/lib1/ng-package.json',
            },
          },
        },
      };

      expect(() => throwOnInvalidLibProject('lib1', ngLibProject)).toThrow();
    });

    it('should throw on undefined root', () => {
      // arrange
      const ngLibProject: NGLibProject = {
        projectType: 'library',
        root: undefined,
        architect: {
          build: {
            options: {
              project: 'projects/lib1/ng-package.json',
            },
          },
        },
      };

      expect(() => throwOnInvalidLibProject('lib1', ngLibProject)).toThrow();
    });

    it('should throw on undefined architect', () => {
      // arrange
      const ngLibProject: NGLibProject = {
        projectType: 'library',
        root: 'projects/lib1',
        architect: undefined,
      };

      expect(() => throwOnInvalidLibProject('lib1', ngLibProject)).toThrow();
    });

    it('should throw on undefined build', () => {
      // arrange
      const ngLibProject: NGLibProject = {
        projectType: 'library',
        root: 'projects/lib1',
        architect: {
          build: undefined,
        },
      };

      expect(() => throwOnInvalidLibProject('lib1', ngLibProject)).toThrow();
    });

    it('should throw on undefined options', () => {
      // arrange
      const ngLibProject: NGLibProject = {
        projectType: 'library',
        root: 'projects/lib1',
        architect: {
          build: {
            options: undefined,
          },
        },
      };

      expect(() => throwOnInvalidLibProject('lib1', ngLibProject)).toThrow();
    });

    it('should throw on undefined project', () => {
      // arrange
      const ngLibProject: NGLibProject = {
        projectType: 'library',
        root: 'projects/lib1',
        architect: {
          build: {
            options: {
              project: undefined,
            },
          },
        },
      };

      expect(() => throwOnInvalidLibProject('lib1', ngLibProject)).toThrow();
    });
  }); // describe throwOnInvalidLibProject

  describe('throwOnInvalidAppProject', () => {
    it('should not throw on a valid app project', () => {
      // arrange
      const ngAppProject: NGAppProject = {
        projectType: 'application',
        root: 'projects/app',
        architect: {
          build: {
            options: {
              outputPath: 'dist/app',
            },
          },
        },
      };

      expect(() => throwOnInvalidAppProject('app', ngAppProject)).not.toThrow();
    });

    it('should throw on a null', () => {
      expect(() => throwOnInvalidAppProject('app', null)).toThrow();
    });

    it('should throw on invalid projectType', () => {
      // arrange
      const ngAppProject: NGAppProject = {
        projectType: 'library' as any,
        root: 'projects/app',
        architect: {
          build: {
            options: {
              outputPath: 'dist/app',
            },
          },
        },
      };

      expect(() => throwOnInvalidAppProject('app', ngAppProject)).toThrow();
    });

    it('should throw on undefined projectType', () => {
      // arrange
      const ngAppProject: NGAppProject = {
        projectType: undefined,
        root: 'projects/app',
        architect: {
          build: {
            options: {
              outputPath: 'dist/app',
            },
          },
        },
      };

      expect(() => throwOnInvalidAppProject('app', ngAppProject)).toThrow();
    });

    it('should throw on undefined root', () => {
      // arrange
      const ngAppProject: NGAppProject = {
        projectType: 'application',
        root: undefined,
        architect: {
          build: {
            options: {
              outputPath: 'dist/app',
            },
          },
        },
      };

      expect(() => throwOnInvalidAppProject('app', ngAppProject)).toThrow();
    });

    it('should throw on undefined architect', () => {
      // arrange
      const ngAppProject: NGAppProject = {
        projectType: 'application',
        root: 'projects/app',
        architect: undefined,
      };

      expect(() => throwOnInvalidAppProject('app', ngAppProject)).toThrow();
    });

    it('should throw on undefined build', () => {
      // arrange
      const ngAppProject: NGAppProject = {
        projectType: 'application',
        root: 'projects/app',
        architect: {
          build: undefined,
        },
      };

      expect(() => throwOnInvalidAppProject('app', ngAppProject)).toThrow();
    });

    it('should throw on undefined options', () => {
      // arrange
      const ngAppProject: NGAppProject = {
        projectType: 'application',
        root: 'projects/app',
        architect: {
          build: {
            options: undefined,
          },
        },
      };

      expect(() => throwOnInvalidAppProject('app', ngAppProject)).toThrow();
    });

    it('should throw on undefined outputPath', () => {
      // arrange
      const ngAppProject: NGAppProject = {
        projectType: 'application',
        root: 'projects/app',
        architect: {
          build: {
            options: {
              outputPath: undefined,
            },
          },
        },
      };

       // assert
      expect(() => throwOnInvalidAppProject('app', ngAppProject)).toThrow();
    });
  }); // describe throwOnInvalidAppProject

  describe('throwOnInvalidAngularProjectSettings', () => {
    it ('should not throw on valid angular project settings', () => {
      const angularProjectSettings: NGPackage = {
        dest: '../../dist/lib1',
      };

      // assert
      expect(() => throwOnInvalidAngularProjectSettings('lib1', angularProjectSettings)).not.toThrow();
    });

    it ('should throw on missing dest', () => {
      const angularProjectSettings: NGPackage = {
        dest: undefined,
      };

      // assert
      expect(() => throwOnInvalidAngularProjectSettings('lib1', angularProjectSettings)).toThrow();
    });
  }); // describe throwOnInvalidAngularProjectSettings

  describe('throwOnInvalidPackageInfo', () => {
    it ('should not throw on valid package info without repository settings', () => {
      // arrange
      const packageInfo: PackageInfo = {
        version: '1.2.3',
      };

      // assert
      expect(() => throwOnInvalidPackageInfo('lib1', packageInfo)).not.toThrow();
    });

    it ('should not throw on valid package info with repository settings', () => {
      // arrange
      const packageInfo: PackageInfo = {
        version: '1.2.3',
        repository: {
          type: 'git',
          url: 'some-url.git',
        },
        'ng-publish-to-git': {
          packages: [
            {
              name: 'lib1',
              publish: true,
            },
          ],
        },
      };

      // assert
      expect(() => throwOnInvalidPackageInfo('lib1', packageInfo)).not.toThrow();
    });

    it ('should throw on missing version', () => {
      // arrange
      const packageInfo: PackageInfo = {
        version: undefined,
      };

      // assert
      expect(() => throwOnInvalidPackageInfo('lib1', packageInfo)).toThrow();
    });

    it ('should throw on missing repository type', () => {
      // arrange
      const packageInfo: PackageInfo = {
        version: '1.2.3',
        repository: {
          type: undefined,
          url: 'some-url.git',
        },
      };

      // assert
      expect(() => throwOnInvalidPackageInfo('lib1', packageInfo)).toThrow();
    });

    it ('should throw on missing repository url', () => {
      // arrange
      const packageInfo: PackageInfo = {
        version: '1.2.3',
        repository: {
          type: 'git',
          url: undefined,
        },
      };

      // assert
      expect(() => throwOnInvalidPackageInfo('lib1', packageInfo)).toThrow();
    });

    it ('should throw on invalid ng-publish-to-git field', () => {
      // arrange
      const packageInfo: PackageInfo = {
        version: undefined,
        'ng-publish-to-git': {
          packages: undefined,
        },
      };

      // assert
      expect(() => throwOnInvalidPackageInfo('app', packageInfo)).toThrow();
    });

    it ('should handle 0 packages in the ng-publish-to-git field', () => {
      // arrange
      const packageInfo: PackageInfo = {
        version: '1.2.3',
        'ng-publish-to-git': {
          packages: [],
        },
      };

      // assert
      expect(() => throwOnInvalidPackageInfo('app', packageInfo)).not.toThrow();
    });

    it ('should throw on invalid ng-publish-to-git package field. Missing name', () => {
      // arrange
      const packageInfo: PackageInfo = {
        version: '1.2.3',
        'ng-publish-to-git': {
          packages: [
            {
              name: undefined,
              publish: false,
            },
          ],
        },
      };

      // assert
      expect(() => throwOnInvalidPackageInfo('app', packageInfo)).toThrow();
    });

    it ('should throw on invalid ng-publish-to-git package field. Missing publish', () => {
      // arrange
      const packageInfo: PackageInfo = {
        version: '1.2.3',
        'ng-publish-to-git': {
          packages: [
            {
              name: 'app',
              publish: undefined,
            },
          ],
        },
      };

      // assert
      expect(() => throwOnInvalidPackageInfo('app', packageInfo)).toThrow();
    });
  }); // describe throwOnInvalidPackageInfo

  describe('ngGetProjectFileNameFromLibProject', () => {
    it('should return the project filename of a valid library project', () => {
      const ngProject: NGLibProject = {
        projectType: 'library',
        root: 'projects/lib1',
        architect: {
          build: {
            options: {
              project: 'projects/lib1/ng-package.json',
            },
          },
        },
      };

      const projectFilename = ngGetProjectFileNameFromLibProject('lib1', ngProject);

      expect(projectFilename).toEqual('projects/lib1/ng-package.json');
    });
  }); // describe ngGetProjectFileNameFromLibProject

  describe('ngGetDestinationFromProjectFile', () => {
    it('should return the destination', () => {
      const dest = ngGetDestinationFromProjectFile('lib1', 'projects/lib1/ng-package.json');
      expect(dest).toEqual('dist/lib1');
    });
  }); // describe ngGetDestinationFromProjectFile

  describe('ngGetDestinationFromLibProject', () => {
    it('should return the destination', () => {
      const ngLibProject: NGLibProject = {
        projectType: 'library',
        root: 'projects/lib1',
        architect: {
          build: {
            options: {
              project: 'projects/lib1/ng-package.json',
            },
          },
        },
      };

      const dest = ngGetDestinationFromLibProject('lib1', ngLibProject);

      expect(dest).toEqual('dist/lib1');
    });
  }); // describe ngGetDestinationFromLibProject

  describe('ngGetLibProjectPackageInfo', () => {
    it('should return the library package info', () => {
      const ngProject: NGLibProject = {
        projectType: 'library',
        root: 'projects/lib1',
        architect: {
          build: {
            options: {
              project: 'projects/lib1/ng-package.json',
            },
          },
        },
      };

      const packageInfo = ngGetLibProjectPackageInfo('lib', ngProject);

      expect(packageInfo).toEqual({
        version: '2.3.4',
        repository: {
          type: 'git',
          url: 'ssh://git@some-repo/lib1.git',
        },
      });
    });
  }); // describe ngGetLibProjectPackageInfo

  describe('ngGetAppProjectPackageInfo', () => {
    it('should return the application package info', () => {
      const packageInfo = ngGetAppProjectPackageInfo('app');

      expect(packageInfo).toEqual({
        version: '1.2.3',
        repository: {
          type: 'git',
          url: 'ssh://git@some-repo/app.git',
        },
        'ng-publish-to-git': {
          commitPrefix: 'GLOBAL-PREFIX',
          packages: [
            {
              name: 'lib1',
              publish: true,
              repositoryUrl: 'https://some-repo.git',
            },
            {
              name: 'app',
              commitPrefix: 'APP-PREFIX',
              publish: false,
            },
          ],
        },
      });
    });
  }); // describe ngGetAppProjectPackageInfo

  describe('determineCommitPrefix', () => {
    let commandLineCommitPrefix: string;
    let ngPublishToGitConfig: NgPublishToGitConfig;
    let projectName: string;

    beforeEach(() => {
      commandLineCommitPrefix = 'CMD-LINE-123';

      ngPublishToGitConfig = {
        commitPrefix: 'GLOBAL-456',
        packages: [
          {
            name: 'lib1',
            commitPrefix: 'LIB1-123',
          },
          {
            name: 'lib2',
          },
        ],
       } as any;

      projectName = 'lib1';
    });

    it ('should return the command line prefix first', () => {
      // assert
      expect(determineCommitPrefix(commandLineCommitPrefix, ngPublishToGitConfig, projectName)).toBe(commandLineCommitPrefix);
    });

    it ('should return the command line prefix first, even if empty', () => {
      // assert
      expect(determineCommitPrefix('', ngPublishToGitConfig, projectName)).toBe('');
    });

    it ('should return the package specific ng-publish-to-git config prefix second', () => {
      // arrange
      const expectedPrefix = ngPublishToGitConfig.packages.find(item => item.name === projectName).commitPrefix;

      // assert
      expect(determineCommitPrefix(undefined, ngPublishToGitConfig, projectName)).toBe(expectedPrefix);
    });

    it ('should return the package specific ng-publish-to-git config prefix second, even if empty', () => {
      // arrange
      const ngPublishToGitPackageConfig: NgPublishToGitPackageConfig =
        ngPublishToGitConfig.packages.find(item => item.name === projectName);

      ngPublishToGitPackageConfig.commitPrefix = '';

      // assert
      expect(determineCommitPrefix(undefined, ngPublishToGitConfig, projectName)).toBe('');
    });

    it ('should return the global ng-publish-to-git config prefix third', () => {
      // assert
      expect(determineCommitPrefix(undefined, ngPublishToGitConfig, 'non existing project name')).toBe('GLOBAL-456');
    });

    it ('should return the global ng-publish-to-git config prefix third, even if it is empty', () => {
      // arrange
      ngPublishToGitConfig.commitPrefix = '';

      // assert
      expect(determineCommitPrefix(undefined, ngPublishToGitConfig, 'non existing project name')).toBe('');
    });

    it ('should return an empty string if all else fails', () => {
      // arrange
      ngPublishToGitConfig.commitPrefix = undefined;

      // assert
      expect(determineCommitPrefix(undefined, ngPublishToGitConfig, 'non existing project name')).toBe('');
    });
  }); // describe determineCommitPrefix

  describe('ngFilterProjectsWithCommandLineOptions', () => {
    it('should return all project unmodified if no package option is given', () => {
      // arrange
      const pkg = 'lib2';
      const cmdLineArgs: CommandLineArgs = { };
      const projects = ngGetProjects();

      // act
      const filteredProjects = ngFilterProjectsWithCommandLineOptions(projects, cmdLineArgs);

      // assert
      expect(filteredProjects).toBe(projects);
    });

    it('should filter the selected project and set publish to true', () => {
      // arrange
      const pkg = 'lib2';
      const cmdLineArgs: CommandLineArgs = { package: pkg };
      const projects = ngGetProjects().map(p => ({ ...p, publish: false }));

      // act
      const filteredProjects = ngFilterProjectsWithCommandLineOptions(projects, cmdLineArgs);

      // assert
      expect(filteredProjects.length).toEqual(1);
      expect(filteredProjects[0].projectName).toEqual(pkg);
      expect(filteredProjects[0].publish).toEqual(true);
    });

    it('should throw if the cmd line package is not found', () => {
      // arrange
      const pkg = 'non-existing-package';
      const cmdLineArgs: CommandLineArgs = { package: pkg };
      const projects = ngGetProjects();
      const expectedErrorMsg = `Project: ${pkg} not found`;

      // assert
      expect(() => ngFilterProjectsWithCommandLineOptions(projects, cmdLineArgs)).toThrow(expectedErrorMsg);
    });
  }); // describe ngFilterProjectsWithCommandLineOptions
}); // describe ng-workspace

