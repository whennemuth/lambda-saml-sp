const express = require('express');
const multer = require('multer'); // For mulit-part form uploads
const https = require('https');
const { handler, Keys } = require('./app');

/**
 * Start an instance of express listening on the designated port
 */
const startServer = () => {
  const app = express();

  // for parsing application/x-www-form-urlencoded
  app.use(express.urlencoded({ extended: true }));

  // for parsing application/json
  app.use(express.json());

  // for parsing application/octet-stream
  app.use(express.raw());

  // for parsing multipart/form-data
  const upload = multer();
  app.use(upload.array()); 
  app.use(express.static('public'));

  const keys = new Keys();
  const server = https.createServer({key: keys.privateKeyPEM, cert: keys.certificatePEM }, app);
    
  // Handle all http requests
  app.all('/*', async (req, res) => {
    try {
      console.log(`Incoming request: ${JSON.stringify(req, Object.getOwnPropertyNames(req), 2)}`)      
      const event = buildEvent(req);
      console.log(`Generated event: ${JSON.stringify(event, null, 2)}`);
      const lambdaResponse = await handler(event);
      if(lambdaResponse.headers){
        res.set(lambdaResponse.headers);
      }
      res.status(lambdaResponse.statusCode);
      if(req.url == '/login') {
        lambdaResponse.body = '<!DOCTYPE html><html><body><h3>This is the IDP login page</h3></body></html>';
      }
      res.send(lambdaResponse.body);
      console.log(`Lambda Response: ${JSON.stringify(lambdaResponse, null, 2)}`);     
    }
    catch(e) {
      res.status(500).contentType('text/html').send(`
      <!DOCTYPE html>
      <html>
        <body>
          <p><b>${e.message}</b></p>
          <pre>${e.stack}</pre>
        </body>
      </html>      
    `);
    }
  });

  server.listen(443, '0.0.0.0', () => console.log(`⚡️[bootup]: Server is running at port: ${443}`));
}

const buildEvent = (req) => {

  const { headers, protocol, url } = req;
  const headersOut = {};
  const rawPath = req.url.split('?')[0];
  const rawQueryString = req._parsedUrl?.query;
  Object.keys(headers).forEach(key => {
    headersOut[key.toLowerCase()] = req.header(key);
  });

  const relayDomain = `${protocol}://${req.header('host')}`;
  const relayState = encodeURIComponent(`${relayDomain}${url}`);
  const loginUrl = `${relayDomain}/login?relay_state=${relayState}`;
  const logoutUrl = `${relayDomain}/logout`;
  const { APP_LOGIN_HEADER, APP_LOGOUT_HEADER } = process.env;
  headersOut[APP_LOGIN_HEADER] = encodeURIComponent(loginUrl);
  headersOut[APP_LOGOUT_HEADER] = encodeURIComponent(logoutUrl);

  return {
    rawPath,
    rawQueryString,
    cookies: [
      req.header('Cookie')
    ],
    headers: headersOut
  }
}

startServer();