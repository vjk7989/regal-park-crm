import { createApp } from './routes';

const port = Number(process.env.API_PORT) || 4000;
createApp().listen(port, () => console.log(`Regal Park CRM API on http://localhost:${port}`));
