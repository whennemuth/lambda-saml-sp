import { jest } from '@jest/globals';
import { handler } from './FunctionSpOrigin';
import { CachedKeys } from './lib/Secrets';
import * as event from './lib/sp-event.json';
import { SamlResponseObject, SendAssertResult } from './lib/Saml';
import { MockSamlAssertResponse } from './lib/test/SamlAssertResponseFriendlyMock';


const distributionDomainName = 'd129tjsl6pgy8.cloudfront.net';
const uri = '/path/to/app';
const loginUrl = 'https://shib-test.bu.edu/idp/profile/SAML2/Redirect/SSO?SAMLRequest=some_base64_value';
const logoutUrl = 'https://shib-test.bu.edu/Shibboleth.sso/Logout';

/**
 * ---------------------------------------------------------------------------
 *                             CREATE MOCKS 
 * (beware: must define at global scope - no outer function, if blocks, etc.)
 * ---------------------------------------------------------------------------
 */

/**
 * Mock the behavior of Secrets.ts (getting secrets from secret manager).
 */
jest.mock('./lib/Secrets', () => {
  const originalModule = jest.requireActual('./lib/Secrets');
  if(process.env?.unmocked === 'true') {
    return originalModule;
  }
  return {
    __esModule: true,
    originalModule,
    checkCache: async (cache:CachedKeys): Promise<void> => {
      // const keys = new Keys();
      cache.samlCert = 'dummy_cert';
      cache.samlPrivateKey = 'dummy_pk';
      cache.jwtPublicKey = 'dummy_pub_jwt_key'
      cache.jwtPrivateKey = 'dummy_pvt_jwt_key';
    }
  };
});

/**
 * Partial mock for SamlTools. Mocks the sendAssert function to return either good or bad result.
 * 
 * NOTE: Using mockImplementation() for ES6 class mocking, but beware of gotchas. SEE: 
 * https://jestjs.io/docs/es6-class-mocks#calling-jestmock-with-the-module-factory-parameter
 */
jest.mock('./lib/Saml', () => {
  if(process.env?.unmocked === 'true') {
    return jest.requireActual('./lib/Saml');
  }
  return {
    SamlTools: jest.fn().mockImplementation(() => {
      return {
        setSpCertificate: (cert: string) => jest.fn(),
        setPrivateKey: (key: string) => jest.fn(),
        setAssertUrl: (url: string) => jest.fn(),
        createLoginRequestUrl: async (path: string) => {
          return new Promise((resolve, reject) => {
            resolve(loginUrl);
          })
        },
        createLogoutRequestUrl: async () => {
          return new Promise((resolve, reject) => {
            resolve(logoutUrl);
          })
        },
        getSamlResponseParameter: (request: any):SamlResponseObject|null => {
          return {
            samlResponseParm: '',
            xmlData: ''
          } as SamlResponseObject;
        },
        sendAssert: async (request:any): Promise<SendAssertResult|null> => {
          return new Promise((resolve, reject) => {
            const scenario = request.headers['TEST_SCENARIO'][0].value;
            switch(scenario) {
              case 'good':
                resolve({
                  samlAssertResponse: MockSamlAssertResponse,
                  relayState: encodeURIComponent(`https://${distributionDomainName}${uri}`)
                });
                break;
              case 'bad':
                reject('mock error');
                break;
            }
          });
        }    
      }
    })
  }
});

/**
 * Mock the behavior of JwtTools
 */
let validToken = true;
const cookie_invalidation = 'COOKIE_NAME=invalidated; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly';
jest.mock('./lib/Jwt', () => {
  if(process.env?.unmocked === 'true') {
    return jest.requireActual('./lib/Jwt');
  }
  return {
    JwtTools: jest.fn().mockImplementation(() => {
      return {
        resetPrivateKey: (key:string) => jest.fn(),
        resetPublicKey: (key:string) => jest.fn(),
        hasValidToken: (request:any):boolean => {
          return validToken;
        },
        setCookieInResponse: (response:any, payload:any) => {
          response.headers['set-cookie'] = [{ 
            key: 'Set-Cookie', 
            value: 'COOKIE_NAME=dummy_token_value; dummy_serialized_opts' 
          }];
        },
        setCookieInvalidationInResponse: (response:any) => {
          response.headers['set-cookie'] = [{
            key: 'Set-Cookie',
            value: cookie_invalidation
          }];
        }
      }
    })
  }
})

/**
 * ---------------------------------------------------------------------------
 *                       TEST HARNESS.
 * ---------------------------------------------------------------------------
 */
if(process.env?.unmocked === 'true') {
  handler(event).then((response) => {
    JSON.stringify(response, null, 2);
  })
}

/**
 * ---------------------------------------------------------------------------
 *                       MOCKED UNIT TESTING.
 * ---------------------------------------------------------------------------
 */
else {

  const getHeaderValue = (response:any, name:string): any|null => {
    if( ! response || ! response.headers || ! response.headers[name] ) return null;
    return response.headers[name][0].value || null;
  }
  /**
   * Search the response for a specified header with a specified value
   */
  const responseHasHeaderValue = (response:any, name:string, value:string): string|null => {
    return getHeaderValue(response, name) == value ? value : null; 
  }

  /**
   * Search the response for a specified header with a value whose value starts with the specified value
   */
  const responseHasHeaderWithValueStartingWith = (response:any, name:string, valueSegment:string): string|null => {
    const value = getHeaderValue(response, name) as string;
    return value.startsWith(valueSegment) ? value : null;
  };

  /**
   * Returns a lambda event mock with only the essential fields present.
   * @returns 
   */
  const getEssentialEvent = () => {
    const data = 'some random string';
    return {
      Records: [
        {
          cf: {
            config: { distributionDomainName },
            request: {
              body: { 
                data: `${btoa(data)}`
              },
              headers: {
                host: [ { key: 'Host', value: 'wp3ewvmnwp5nkbh3ip4qulkwyu0qoglu.lambda-url.us-east-1.on.aws' } ],
                origin: [ { key: 'origin', value: 'https://localhost/me/at/my/laptop' } ],
                TEST_SCENARIO: [] as any
              },
              method: 'GET',
              origin: {
                domainName: 'wp3ewvmnwp5nkbh3ip4qulkwyu0qoglu.lambda-url.us-east-1.on.aws',                  
              },
              querystring: '',
              uri
            }
          }
        }
      ]
    }; 
  }

  describe('Origin request lambda event handler', () => {

    it('Should redirect to the login path if the original path is to the app and no valid JWT token', async () => {
      validToken = false;
      const event = getEssentialEvent();
      const response = await handler(event);
      expect(response.status).toEqual('302');
      const location = getHeaderValue(response, 'location');
      const url = new URL(location);
      expect(url.host).toEqual(distributionDomainName);
      expect(url.pathname).toEqual('/login');      
      const qsparms = new URLSearchParams(url.searchParams);
      const relayState = decodeURIComponent(qsparms?.get('relay_state') || '');
      expect(relayState).toEqual(`https://${distributionDomainName}${uri}`);
    });

    it('Should terminate if the original path is to the app, no JWT token, and an "after_auth" parameter is "true"', async () => {
      validToken = false;
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = '/some/path';
      event.Records[0].cf.request.querystring = 'after_auth=true';
      const response = await handler(event);
      expect(response).toBeDefined();
      expect(response.status).toEqual('500');
      expect(responseHasHeaderValue(response, 'content-type', 'text/plain'));
      expect(response.body).toEqual('Authentication should have resulted in a valid JWT - no valid token found');
    });

    it('Should redirect to the IDP for authentication if login path', async () => {
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = '/login';
      event.Records[0].cf.request.headers.origin = [ { key: 'origin', value: `https://${distributionDomainName}` } ]
      const response = await handler(event);
      expect(response).toBeDefined();
      expect(response.status).toEqual('302');
      expect(responseHasHeaderWithValueStartingWith(
        response, 
        'location', 
        'https://shib-test.bu.edu/idp/profile/SAML2/Redirect/SSO?SAMLRequest=')).toBeTruthy();
    });

    it('Should handle an incoming saml response request from the IDP by performing assertion', async () => {
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = '/assert';
      event.Records[0].cf.request.headers.origin = [ { key: 'origin', value: `https://shib-test.bu.edu` } ];

      // Test the scenario in which the assertion attempt errors out:
      event.Records[0].cf.request.headers.TEST_SCENARIO[0] = { key: 'assert_result', value: 'bad' };
      
      let response:any = await handler(event);
      expect(response).toBeDefined();
      expect(response.status).toEqual('500');

      // Test the scenario in which the assertion attempt is successful:
      event.Records[0].cf.request.headers.TEST_SCENARIO[0] = { key: 'assert_result', value: 'good' };
      response = await handler(event);
      expect(response).toBeDefined();
      expect(response.status).toEqual('302');
      const relayState = `https://${distributionDomainName}${uri}`;
      const redirectUrl = `${relayState}?after_auth=true`;
      expect(responseHasHeaderValue(response, 'location', redirectUrl));
      const cookie = getHeaderValue(response, 'set-cookie');
      expect(cookie).not.toBeNull();
    });

    it('Should simply forward to the origin if a valid token in header', async () => {
      validToken = true;
      const event = getEssentialEvent();
      let response:any = await handler(event);
      expect(response).toEqual(event.Records[0].cf.request);
    });

    it('Should respond to initial logout with jwt invalidation and redirect back for step two', async () => {
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = '/logout';
      let response:any = await handler(event);
      expect(response.status).toEqual('302');
      expect(responseHasHeaderValue(response, 'set-cookie', cookie_invalidation)).toBeTruthy();
      expect(responseHasHeaderValue(response, 'location', `https://${distributionDomainName}/logout?target=idp`)).toBeTruthy();
    });

    it('Should respond to the secondary logut with redirect to the IDP for logout', async () => {
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = '/logout';
      event.Records[0].cf.request.querystring = 'target=idp';
      let response:any = await handler(event);
      expect(response.status).toEqual('302');
      expect(responseHasHeaderValue(response, 'location', logoutUrl)).toBeTruthy();
    });
  });
}