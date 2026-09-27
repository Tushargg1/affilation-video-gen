const { execSync } = require('child_process');

const envs = [
  { name: 'UPSTASH_REDIS_REST_URL', value: 'https://tight-maggot-293739.upstash.io' },
  { name: 'UPSTASH_REDIS_REST_TOKEN', value: 'gQAAAAAABHtrAAIgcDFmMTllZmY1ODNkYmI0NTgyYTQ1NDFjMzNlMTA4NzE2NA' }
];

const targets = ['production'];

for (const env of envs) {
  for (const target of targets) {
    console.log(`Adding ${env.name} to ${target}...`);
    try {
      execSync(`npx vercel env add ${env.name} ${target}`, { input: env.value, stdio: ['pipe', 'inherit', 'inherit'] });
    } catch (e) {
      console.log(`Failed to add ${env.name} to ${target}. Trying update...`);
      try {
        execSync(`npx vercel env update ${env.name} ${target}`, { input: env.value, stdio: ['pipe', 'inherit', 'inherit'] });
      } catch (err) {
        console.error(`Failed to update ${env.name} on ${target}`);
      }
    }
  }
}
