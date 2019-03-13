const path = require('path');
const execa = require('execa');
const { readFile } = require('fs.promised');
const getWritableDirectory = require('@now/build-utils/fs/get-writable-directory.js'); // eslint-disable-line import/no-extraneous-dependencies
const download = require('@now/build-utils/fs/download.js'); // eslint-disable-line import/no-extraneous-dependencies
const glob = require('@now/build-utils/fs/glob.js'); // eslint-disable-line import/no-extraneous-dependencies
const { createLambda } = require('@now/build-utils/lambda.js'); // eslint-disable-line import/no-extraneous-dependencies

const pip = require('./pip');
const log = require('./log');


exports.config = {
  maxLambdaSize: '5mb',
};


exports.build = async ({ files, entrypoint, config }) => {
  log.title('Starting build');

  // config.wsgiApplication must be set
  if (config.wsgiApplication === null) {
    throw new Error('config.wsgiApplication must be set');
  }

  const systemReleaseContents = await readFile(
    path.join('/etc', 'system-release'),
    'utf8',
  );
  log.info(`Build AMI version: ${systemReleaseContents.trim()}`);

  const pythonVersion = await execa('python3', ['--version']);
  log.info(`Build python version: ${pythonVersion.stdout}`);
  log.info(`Lambda runtime: ${(config.runtime || 'python3.6 (default)')}`);
  log.info(`WSGI application: ${config.wsgiApplication}`);

  log.heading('Downloading project');
  const srcDir = await getWritableDirectory();

  // eslint-disable-next-line no-param-reassign
  files = await download(files, srcDir);

  log.heading('Preparing python');
  const pyUserBase = await getWritableDirectory();
  process.env.PYTHONUSERBASE = pyUserBase;
  const pipPath = await pip.downloadAndInstallPip();

  log.heading('Installing handler');
  await pip.install(pipPath, srcDir, __dirname);

  log.heading('Installing project requirements');
  const requirementsTxtPath = pip.findRequirements(entrypoint, files);
  if (requirementsTxtPath) {
    await pip.install(pipPath, srcDir, '-r', requirementsTxtPath);
  }

  log.heading('Preparing lambda bundle');
  log.info(`Entrypoint is ${entrypoint}`);

  const lambda = await createLambda({
    files: await glob('**', srcDir),
    handler: 'now_python_wsgi.now_handler',
    runtime: `${config.runtime || 'python3.6'}`,
    environment: {
      WSGI_APPLICATION: config.wsgiApplication,
    },
  });

  log.title('Done!');

  return {
    [entrypoint]: lambda,
  };
};
