import express from 'express';
import type { AddressInfo } from 'net';
import http from 'http';
import healthRoute from '../src/routes/health';

/**
 * Health check, tested cleanly against a real Express app (no route.stack
 * reach-in). We mount the ported router, boot the app on an ephemeral port,
 * and make a real HTTP GET — asserting on the response body.
 */
describe('Streaks API — Health', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll((done) => {
    const app = express();
    app.use('/api/v1/health', healthRoute);
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /api/v1/health returns service identity, status, and timestamp', async () => {
    const body = await new Promise<Record<string, unknown>>((resolve, reject) => {
      http
        .get(`${baseUrl}/api/v1/health`, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => resolve(JSON.parse(data)));
        })
        .on('error', reject);
    });

    expect(body.service).toBe('streaks-api');
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
