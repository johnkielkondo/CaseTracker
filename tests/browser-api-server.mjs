// Local-only integration fixture. It never contacts the live Supabase project.
import { createServer } from '../api/server.mjs';
import { fixture } from './fixtures/supabase.mjs';
const mock = fixture();
const server = createServer({ instanceId:'i-local-test' }, {
  config: { url:'https://example.supabase.co', key:'sb_publishable_test' }, fetchImpl: mock.fetchImpl
});
server.listen(3000, '127.0.0.1', () => console.log('Local fixture API listening on 3000'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
