import semanticRelease from 'semantic-release';
import { releaseFailure } from './errors.mjs';

try {
  await semanticRelease();
} catch (error) {
  const message = releaseFailure(error, [process.env.GITHUB_TOKEN, process.env.GH_TOKEN]);
  if (process.env.GITHUB_ACTIONS === 'true')
    console.error(`::error title=Release failed::${message}`);
  else console.error(message);
  process.exitCode = 1;
}
