import { jest } from '@jest/globals';
import { AUTH_PATHS, handler } from './FunctionSpOrigin';
import { CachedKeys } from './lib/Secrets';
import * as event from './lib/sp-event.json';
import { SamlResponseObject, SendAssertResult } from './lib/Saml';
import { MockSamlAssertResponse } from './lib/test/SamlAssertResponseFriendlyMock';
import { JwtTools } from './lib/Jwt';
import { IContext } from '../../context/IContext';
import * as contextJSON from '../../context/context.json';

const context = contextJSON as IContext;
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
let validToken: any;
const cookie_invalidation = `${JwtTools.COOKIE_NAME}=invalidated; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly`;
jest.mock('./lib/Jwt', () => {
  const originalModule = jest.requireActual('./lib/Jwt') as JwtTools;
  if(process.env?.unmocked === 'true') {
    return originalModule;
  }
  return {
    JwtTools: jest.fn().mockImplementation(() => {
      return {
        __esModule: true,
        ...originalModule, 
        resetPrivateKey: (key:string) => jest.fn(),
        resetPublicKey: (key:string) => jest.fn(),
        hasValidToken: (request:any):any => {
          return validToken;
        },
        setCookieInResponse: (response:any, payload:any) => {
          response.headers['set-cookie'] = [{ 
            key: 'Set-Cookie', 
            value: `${JwtTools.COOKIE_NAME}=dummy_token_value; dummy_serialized_opts` 
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
});


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
                TEST_SCENARIO: [] as any,
                cookie: [] as any
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

  const getDeepClone = (obj:any):any => {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Test all endpoints of authentication flow for the sp.
   * Also assert that the flow changes where necessary when the app is configured to "decide" authentication requirement. 
   */
  describe('FunctionSpOrigin.handler', () => {

    it('Should redirect to the login path if the original path is to the app and no valid JWT token', async () => {
      validToken = null;
      const event = getEssentialEvent();

      // The sp will blanket require every request to be authenticated.
      process.env.APP_AUTHORIZATION = 'false';
      let response = await handler(event);
      expect(response.status).toEqual('302');
      const location = getHeaderValue(response, 'location');
      const url = new URL(location);
      expect(url.host).toEqual(distributionDomainName);
      expect(url.pathname).toEqual('/login');      
      const qsparms = new URLSearchParams(url.searchParams);
      const relayState = decodeURIComponent(qsparms?.get('relay_state') || '');
      expect(relayState).toEqual(`https://${distributionDomainName}${uri}`);

      // The sp will delegate to the app for authentication decisions.
      process.env.APP_AUTHORIZATION = 'true';
      response = await handler(event);
      // Get a clone of the request in the event object
      const expectedResponse = getDeepClone(event.Records[0].cf.request) as any;
      // Modify the request the same way it is expected that the handler will
      expectedResponse.headers.authenticated = [{ key: 'authenticated', value: 'false'}];
      expectedResponse.headers.login = [{ key: 'login', value: AUTH_PATHS.LOGIN}];
      // Assert equality   
      expect(response).toEqual(expectedResponse);
    });

    it('Should terminate if the original path is to the app, no JWT token, and an "after_auth" parameter is "true"', async () => {
      validToken = null;
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = '/some/path';
      event.Records[0].cf.request.querystring = 'after_auth=true';

      const assert = () => {
        expect(response).toBeDefined();
        expect(response.status).toEqual('500');
        expect(responseHasHeaderValue(response, 'content-type', 'text/plain'));
        expect(response.body).toEqual('Authentication should have resulted in a valid JWT - no valid token found');
      }

      process.env.APP_AUTHORIZATION = 'false';
      let response = await handler(event);
      assert();

      // Should behave the same.
      process.env.APP_AUTHORIZATION = 'true';
      response = await handler(event);
      assert();
    });

    it('Should redirect to the IDP for authentication if login path', async () => {
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = '/login';
      event.Records[0].cf.request.headers.origin = [ { key: 'origin', value: `https://${distributionDomainName}` } ]

      const assert = () => {
        expect(response).toBeDefined();
        expect(response.status).toEqual('302');
        expect(responseHasHeaderWithValueStartingWith(
          response, 
          'location', 
          'https://shib-test.bu.edu/idp/profile/SAML2/Redirect/SSO?SAMLRequest=')).toBeTruthy();
      }

      process.env.APP_AUTHORIZATION = 'false';
      let response = await handler(event);
      assert();

      // Should behave the same.
      process.env.APP_AUTHORIZATION = 'true';
      response = await handler(event);
      assert();
    });

    it('Should handle an incoming saml response request from the IDP by performing assertion', async () => {
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = '/assert';
      event.Records[0].cf.request.headers.origin = [ { key: 'origin', value: `https://shib-test.bu.edu` } ];

      // Test the scenario in which the assertion attempt errors out:
      const testScenario1 = async () => {
        event.Records[0].cf.request.headers.TEST_SCENARIO[0] = { key: 'assert_result', value: 'bad' };
        
        const assert = () => {
          expect(response).toBeDefined();
          expect(response.status).toEqual('500');
        }
        process.env.APP_AUTHORIZATION = 'false';
        let response:any = await handler(event);
        assert();

        // Should behave the same;
        process.env.APP_AUTHORIZATION = 'true';
        response = await handler(event);
        assert();
      }

      // Test the scenario in which the assertion attempt is successful:
      const testScenario2 = async () => {
        event.Records[0].cf.request.headers.TEST_SCENARIO[0] = { key: 'assert_result', value: 'good' };

        const assert = () => {
          expect(response).toBeDefined();
          expect(response.status).toEqual('302');
          const relayState = `https://${distributionDomainName}${uri}`;
          const redirectUrl = `${relayState}?after_auth=true`;
          expect(responseHasHeaderValue(response, 'location', redirectUrl));
          const cookie = getHeaderValue(response, 'set-cookie');
          expect(cookie).not.toBeNull();
        }

        process.env.APP_AUTHORIZATION = 'false';
        let response = await handler(event);
        assert();

        // Should behave the same.
        process.env.APP_AUTHORIZATION = 'false';
        response = await handler(event);
        assert();
      }

      await testScenario1();

      await testScenario2();
    });

    it('Should simply forward to the origin if a valid token in header', async () => {
      // At this point in the auth flow, the assert callback is taking place and a token should be present as a header:
      validToken = {
        [JwtTools.TOKEN_NAME]: {
          sub: MockSamlAssertResponse.user.name_id, 
          user: MockSamlAssertResponse.user.attributes
        }
      };
      const event = getEssentialEvent();
      const originalHeaders = getDeepClone(event.Records[0].cf.request.headers);

      const assert = () => {
        // Assert that all the original headers are retained in the response:
        expect(response.headers).toEqual(
          expect.objectContaining(originalHeaders)
        );
        // Assert that the headers the event was supposed to add are also present:
        const { headers:hdrs } = response;
        expect(hdrs.authenticated).toEqual([{ key: 'authenticated', value: 'true' }]);
        expect(hdrs['user-details']).toBeDefined();
        expect(hdrs[context.APP_LOGIN_HEADER]).toBeDefined();
        expect(hdrs.eduPersonAffiliation).toBeDefined();
        expect(hdrs.eduPersonEntitlement).toBeDefined();
        expect(hdrs.eduPersonPrincipalName).toBeDefined();
        expect(hdrs.buPrincipal).toBeDefined();
      }

      process.env.APP_AUTHORIZATION = 'false';
      let response:any = await handler(event);
      assert();

      process.env.APP_AUTHORIZATION = 'true';
      response = await handler(event);
      assert();      
    });

    it('Should respond to initial logout with jwt invalidation and redirect back for step two', async () => {
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = AUTH_PATHS.LOGOUT;

      const assert = () => {
        expect(response.status).toEqual('302');
        expect(responseHasHeaderValue(response, 'set-cookie', cookie_invalidation)).toBeTruthy();
        expect(responseHasHeaderValue(response, 'location', `https://${distributionDomainName}/logout?target=idp`)).toBeTruthy();
      }

      process.env.APP_AUTHORIZATION = 'false';
      let response:any = await handler(event);
      assert();

      // Should behave the same.
      process.env.APP_AUTHORIZATION = 'true';
      response = await handler(event);
      assert();
    });

    it('Should respond to the secondary logut with redirect to the IDP for logout', async () => {
      const event = getEssentialEvent();
      event.Records[0].cf.request.uri = AUTH_PATHS.LOGOUT;
      event.Records[0].cf.request.querystring = 'target=idp';

      const assert = () => {
        expect(response.status).toEqual('302');
        expect(responseHasHeaderValue(response, 'location', logoutUrl)).toBeTruthy();
      }

      process.env.APP_AUTHORIZATION = 'false';
      let response:any = await handler(event);
      assert();

      // Should behave the same.
      process.env.APP_AUTHORIZATION = 'false';
      response = await handler(event);
      assert();
    });
  });
}