import { JwtTools } from './lib/Jwt';
import { Keys } from './lib/Keys';
import * as contextJSON from '../../context/context.json';
import { IContext } from '../../context/IContext';

const context = contextJSON as IContext;
const { APP_LOGIN_HEADER, APP_LOGOUT_HEADER } = context;
const { APP_AUTHORIZATION='false' } = process?.env;
const faviconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABhGlDQ1BJQ0MgcHJvZmlsZQAAKJF9kT1Iw0AcxV/TSkUqDnYQcchQXbSLijiWViyChdJWaNXB5NIvaNKQpLg4Cq4FBz8Wqw4uzro6uAqC4AeIq4uToouU+L+k0CLGg+N+vLv3uHsHCK0aU81ADFA1y8gk42K+sCoGXxGCHwGImJSYqaeyizl4jq97+Ph6F+VZ3uf+HINK0WSATySOMd2wiDeI5zYtnfM+cZhVJIX4nHjKoAsSP3JddvmNc9lhgWeGjVwmQRwmFss9LPcwqxgq8SxxRFE1yhfyLiuctzirtQbr3JO/MFTUVrJcpzmGJJaQQpo6ktFAFTVYiNKqkWIiQ/txD/+o40+TSyZXFYwcC6hDheT4wf/gd7dmaWbaTQrFgb4X2/4YB4K7QLtp29/Htt0+AfzPwJXW9ddbwPwn6c2uFjkChraBi+uuJu8BlzvAyJMuGZIj+WkKpRLwfkbfVACGb4GBNbe3zj5OH4AcdbV8AxwcAhNlyl73eHd/b2//nun09wOl3XK7fzzCVAAAAAZiS0dEAPcA0QAGZn/NAAAAAAlwSFlzAAAuIwAALiMBeKU/dgAAAAd0SU1FB+cMAwYTIqDSv7EAAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAAB50lEQVRYw+2XsWsUQRSHvzczewkSBIlCUihYSEQwBkFRMJDKVhBSBISUCgYr04j5C9JYaJ3C3kZCwEoU7MRclTbBQgshkkLvbnfeszg0t5c7o3eb3Savm52dmW/e/H7DGzEwKgxHxVE5QOhsNOq1UhYdvdLqDSB7xshs2nvUWbDzYJeFeMsTL7mSj+AzyDtwL4xkISNZz6rVgH+iyJ4dLUBcdTTqNRqfajTfJtiC5Ppl10rKgAM7JcQbXb+PSbEu6J8KcLuG/6B/PumSoOPDA0jnTdh8n/R3QUfoY0c6H7DR4W04kAhly/CbsZBLfDCAdSPcjySvs6PVQFx1pLdDe6cR3DcjeZYhG+2t+xXFr+ynM33pidP+gFNG5tLcnP+fAWmj6oSgN4UiI/xz2lsgXxT3RssD8MuKX2717be7gryy8kX4e/F4x5V3BJwBuwA2Leg1Rzbj8dtaLICdlNJqguOSrBiArtHS7G3fvLWkOAA70VUfbB+0pPuaF6qNFZgBPS0w1bG550rYjMhPgxTcjuLX8gB6Tga0YR8PZQ894VFst79DWIwEYm/gB4JOumJFmM164tPDp7F7QroYhriI/iLEdD4Qryv+o+LqhmwZ/ACbEmxGiFcd8aIDf0hFVMXDRI4fp1UD/AJxjqN8NNTlNgAAAABJRU5ErkJggg==';

/**
 * This is a lambda function that represents an "application" that one will have access to after having
 * authenticated with the saml IDP. It will just return user info found in the event object, formatted 
 * for html as <pre> element content, but depending on if APP_AUTHORIZATION is set, it may first involve 
 * itself in determining if the request needs authentication and is also authorized to view the requested 
 * endpoint before returning the html (simulates how wordpress works with shibboleth). 
 * 
 * NOTE:
 * If you hit the function url directly, the content type will always be "application/json" and therefore no
 * embedding in a stardard response object (with a "text/html" content-type) will remedy this.
 * However, when this output passes through the lambda@edge viewer response function, the content-type is switched
 * to "text/html", so if you come in through the public cloudfront distribution url, the formatting will be there.
 */
const handler = async (event:any) => {
  console.log(`EVENT: ${JSON.stringify(event, null, 2)}`);

  const { headers, rawPath='/' } = event;
  let appAuth = APP_AUTHORIZATION == 'true';
  if( ! appAuth) {
    appAuth = 'true' == headers?.APP_AUTHORIZATION;
  }

  const pathParts = (rawPath as string).split('/').map(p => p.toLocaleLowerCase());
  if(appAuth) {

    const authenticated = headers.authenticated == 'true';

    if(pathParts.includes('private') && !authenticated) {
      return getLoginResponse(event);
    }

    if(pathParts.includes('unauthorized')) {
      return getUnauthorizedResponse(event);
    }
  }

  return getOkResponse(event);
}

/**
 * Get the login url to return for redirection to the IDP.
 * @param event
 * @returns 
 */
const getLoginResponse = (event:any) => {
  const { headers } = event;
  const loginUrl = decodeURIComponent(headers[APP_LOGIN_HEADER]);
  const loginResponse = {
    statusCode: 302,
    // body: "login",
    headers: {
      ["content-type"]: "text/html",
      Location: loginUrl
    }
  }

  console.log(`LOGIN RESPONSE: ${JSON.stringify(loginResponse, null, 2)}`);
  return loginResponse;
}

/**
 * Request is authenticated, but still the user lacks the authorization to view the endpoint. Return a 403.
 * @param event 
 * @returns 
 */
const getUnauthorizedResponse = (event:any) => {
  const { headers: { authenticated } } = event;
  let msg = 'Forbidden: Sorry, I know who you are, but you lack the authorization to view this resource.'
  if(authenticated != 'true') {
    msg = 'Forbidden: Sorry, I don\'t know who you are, and cannot tell if you are the authorization to view this resource.'
  }
  return {
    statusCode: 403,
    body: `<!DOCTYPE html><html><body><h3>${msg}</h3></body></html>`,
    headers: {
      ["content-type"]: "text/html",
    }
  }
}

/**
 * Request is authenticated and authorized. Return the requested content.
 * This is a dummy app, return a printout of all user data returned from the IDP in the header/cookie. 
 * @param event 
 * @returns 
 */
const getOkResponse = (event:any) => {
  try {
    const { headers } = event;

    // WHAT! No headers?
    if( ! headers) {
      return {
        statusCode: 500,
        body: '<!DOCTYPE html><html><body><h3>Something went wrong!<br>No headers detected</h3></body></html>',
        headers: {
          ["content-type"]: "text/html",
        }
      }
    }

    // 1) First check the "user-details" header for user data.
    let user;
    if(headers['user-details']) {
      const userBase64 = headers['user-details'];
      const authTokenJson = Buffer.from(userBase64, 'base64').toString();
      user = (JSON.parse(authTokenJson))[JwtTools.TOKEN_NAME].user;
    }

    // 2) If No user details header, check for the jwt and get user details from that.
    if( ! user) {
      user = getUserFromJwt(headers['cookie'], 'auth-token-cookie');
    }

    // 3) If no jwt or expected jwt content, respond with warning and list out what headers were found.
    if( ! user) {
      const loginUrl = decodeURIComponent(headers[APP_LOGIN_HEADER]);
      return {
        statusCode: 200,
        body: `
          <!DOCTYPE html>
          <html>
            <head>
              <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
              <link rel="shortcut icon" href="data:image/x-icon;base64,${faviconBase64}" />
            </head>
            <body>
              <p style="padding:30px; font-weight:bold; font-size:24px;">
                Welcome, whoever you are. You do not seem to be authenticated, but this is a public portion of the website. 
                <button class="btn btn-primary btn-lg" type="button" onclick="document.location.href = '${loginUrl}';">Login</button> 
              </p>
              <p style="padding:30px; font-weight:bold; font-size:24px;">
                user-details and jwt cookie header missing, but here are the remaining headers:
              </p>
              <pre style='padding-left:30px;font-size:14px;'>${Object.keys(headers).map(key => `${key}: ${headers[key]}`).join('<br>')}</pre>
            </body>
          </html>`,
        headers: {
          ["content-type"]: "text/html",
        }
      }
    }

    // 4) User details retrieved. Return them as html.
    return {
      statusCode: 200,
      body: userToHtml(user, headers),
      headers: {
        ["content-type"]: "text/html",
      }
    };
  }
  catch(e:any) {
    return {
      statusCode: 500,
      body: `
        <!DOCTYPE html>
        <html>
          <body>
            <p><b>${e.message}</b></p>
            <pre>${e.stack}</pre>
          </body>
        </html>`,
      headers: {
        ["content-type"]: "text/html",
      }
    }
  }
}

/**
 * Convert a user into html to set the response to for rendering by a browser.
 * @param user 
 * @param headers 
 * @returns 
 */
const userToHtml = (user:any, headers:any) => {
  const logoutUrl = decodeURIComponent(headers[APP_LOGOUT_HEADER]);
  const userJson = JSON.stringify(user, null, 2);
  let preContent = userJson.replace(/\n/g, '<br>').replace(/\\"/g, '"');
  do {
    preContent = preContent.replace(/\\"/g, '"');
  } while(/\\"/.test(preContent));

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
        <link rel="shortcut icon" href="data:image/x-icon;base64,${faviconBase64}" />
      </head>
      <body>
        <p style="padding:30px; font-weight:bold; font-size:24px;">
          Welcome, Warren <button id="btnSignin" class="btn btn-primary btn-lg" type="button" onclick="document.location.href = '${logoutUrl}';">Logout</button> 
        </p>
        <p style="padding-left:30px; font-size:16px;">Here is what shibboleth "said" about you:</p>
        <pre style='padding-left:30px;font-size:14px;'>${preContent}</pre>
      </body>
    </html>
  `;
}

/**
 * The "cookie" header of the request may contain a jwt with user data inside. Extract the user data.
 * @param cookies 
 * @param cookieName 
 * @returns 
 */
const getUserFromJwt = (cookies:string, cookieName:string):string|undefined => {
  try {
    const authTokenJson = atob(
      cookies
        .split(/;\x20?/)
        .filter(a => a.split('=')[0] == cookieName)
        .map(c => c.split('.')[1])[0]
    );
    return (JSON.parse(authTokenJson))[JwtTools.TOKEN_NAME].user
  }
  catch(e) {
    return undefined;
  }
}

/**
 * Find the first field with a value in an object for the list of field names provided.
 * The field is assumed to be an array, and the value is the first element of it.
 * @param parentObj 
 * @param names 
 * @returns 
 */
const findFirstFieldValue = (parentObj:any, ...names:any):string|null => {
  for(const name of names) {
    if(parentObj[name] && parentObj[name].length > 0) {
      if(parentObj[name][0]) {
        return parentObj[name][0];
      }
    }
  }
  return null;
}

const debugLog = (msg:string) => {
  if(process.env?.DEBUG == 'true') {
    console.log(msg);
  }
}

module.exports = { handler, Keys }

