import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { Logger } from '@hashgraphonline/standards-sdk';

const app = express();
const PORT = 3003;
const logger = new Logger({ module: 'CORSProxy' });


app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Expose-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});


app.use('/', createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  ws: true,
  on: {
    proxyRes: (proxyRes) => {
      
      proxyRes.headers['access-control-allow-origin'] = '*';
      proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      proxyRes.headers['access-control-allow-headers'] = '*';
      proxyRes.headers['access-control-expose-headers'] = '*';
    }
  }
}));

app.listen(PORT, () => {
  logger.info('CORS proxy server started', {
    port: PORT,
    proxyTarget: 'http://localhost:3000'
  });
});