export function releaseFailure(error, secrets = []) {
  const errors = error.errors ? [...error.errors] : [error];
  let message = errors
    .map((value) => [value.code, value.message].filter(Boolean).join(': '))
    .join('\n');
  for (const secret of secrets.filter(Boolean)) message = message.replaceAll(secret, '[REDACTED]');
  message = message.replace(/https?:\/\/[^\s/]+@/g, 'https://[REDACTED]@');
  return message
    .slice(-8000)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}
