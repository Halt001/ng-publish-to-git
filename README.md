# ng-publish-to-git

Publishes your Angular library to a git repository instead of npm. It also labels the source and the package in their respective repositories. Version numbers are automatically bumped and there is a detection of changes. Unchanged projects are not published.

If needed version number can always be changed manually but be careful with lowering version numbers as collisions may occur with existing tags.

## Install

```sh
npm install -g ng-publish-to-git
```

## Usage

First you need to add the configuration secion of _ng-publish-to-git_ in your root level `package.json` file.

For example:

```
"ng-publish-to-git": {
  "commitPrefix": "GLOBAL-PREFIX",
  "packages": [
    {
      "name": "lib1",
      "commitPrefix": "LIB1-SPECIFIC-PREFIX",
      "publish": true,
      "repositoryUrl": "https://some-repo-for-lib1-packages.git"
    },
    {
      "name": "lib2",
      "publish": true,
      "repositoryUrl": "ssh://git@some-other-repo-for-lib2-packages.git"
    },
  ]
}
```

After that you can run _ng-publish-to-git_ from the project root directory with one or more of the following command line options:

* --commit-prefix your-prefix
* --package package-name
* --debug
* --prod and --no-prod

**--commit-prefix your-prefix**  
This prefixes all commits to both the source and the package repository with the given prefix. This prefix will be the same for all libraries in your source project. Individual prefixes can also be set in the _ng-publish-to-git_ configuration.

**--package package-name**  
If you have more than one library in your project this option will let you publish only the given library package, the others will remain unpublished.

**--debug**  
This option produces a little more output for solving problems, also the temporary directory where the package is created will not be deleted afterwards and its path will be shown.

The package repository will contain no branches, only tags. You need one package repository for each library but you can have the source for multiple libraries in one repository.

After a successful publish you can install the library as a dependency in your Angular application like a normal dependency with the only difference being that you need to specify during install that it comes from a git repository.

**--prod & --no-prod**  
This option controls whether or not the ng build flag --prod is used. When no option is provided --prod is passed to ng build by default.

Examples:  
--prod  
--prod=false  
--no-prod  

**Examples:**  
npm install git+ssh://git@github.com:npm/some-lib.git#v1.0.27  
npm install git+ssh://git@github.com:npm/some-lib#semver:^5.0  
npm install git+https://isaacs@github.com/npm/some-lib.git  
npm install git://github.com/npm/some-lib.git#v1.0.27  

For more info see the documentation of [`npm install`](https://docs.npmjs.com/cli/install)

## Configuration options

The _ng-publish-to-git_ configuration in the `package.json` file consists of an object with the following keys at root level:

**commitPrefix** (optional)  
This is the global commit prefix, it will be used for all packages that do not have a prefix defined at the package level.

**packages** (required)  
This is an array of package configurations for each individual package.

At the package level you have the following keys available:

**name** (required)  
The name of the library package.

**commitPrefix** (optional)  
A per package override of the global commit prefix.

**publish** (optional)  
A boolean controlling whether or not the package should be published if no package name is specified on the command line. By default packages will be published (if changed) but it might be beneficial to be able to suppress publishing by setting this to false.

**repositoryUrl** (required)  
The url to be used to access the package repository. For example:
```
"repositoryUrl": "https://some-repo-for-lib1-packages.git"

or

"repositoryUrl": "ssh://git@some-other-repo-for-lib2-packages.git"
```

## Pre publish hook
If needed there is the possibility to add the key: ```prePublishToGit``` to the scripts section of a library level `package.json` file. This script will be run before publishing the package and can be used to copy files to the `dist` folder that the ng build command will not copy, like assets (pre Angular 9).

As of Angular 9 a better option may be the use of a _ng-packagr_ setting like is demonstrated [here](https://github.com/ng-packagr/ng-packagr/blob/master/docs/copy-assets.md).
