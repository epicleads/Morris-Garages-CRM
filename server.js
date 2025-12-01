require('ts-node/register');

const { default: buildServer } = require('./server.ts');
const { ensureDeveloper } = require('./services/auth.service');
const { env } = require('./config/env');

const server = buildServer();

const start = async () => {
  try {
    await ensureDeveloper();
  } catch (error) {
    server.log.warn(
      `ensureDeveloper failed: ${error?.message || 'unknown error'}. Continuing startup.`
    );
  }

  try {
    await server.listen({ port: env.port, host: '0.0.0.0' });
    server.log.info(`Server listening on port ${env.port}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

start();
