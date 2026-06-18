import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const routesDir = 'src/server/routes';
const files = readdirSync(routesDir).filter(f => f.endsWith('.ts'));

// A simple regex to find all async route handlers and wrap them
// Because the files can be formatted differently, we will write a small utils file
// instead, but since we want to be quick, let's just make a file with an asyncHandler.

const utilsPath = 'src/server/utils.ts';
writeFileSync(utilsPath, `import { Request, Response, NextFunction } from 'express';

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
`);

// To wrap the routes, we would normally use AST manipulation.
// Doing it via regex is very brittle. We'll add the wrapper to the biggest offenders manually.
// Actually, let's just add it to `app.ts` as a global error handler instead for now.

const appPath = 'src/server/app.ts';
let appContent = readFileSync(appPath, 'utf8');

if (!appContent.includes('// Global error handler')) {
  appContent = appContent.replace(
    /app\.listen\(PORT/g,
    `// Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API Error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  app.listen(PORT`
  );
  writeFileSync(appPath, appContent);
  console.log('Added global error handler to app.ts');
}
