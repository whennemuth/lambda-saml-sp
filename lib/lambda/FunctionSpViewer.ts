
const { APP_AUTHORIZATION='false' } = process?.env;

/**
 * This is a lambda@edge function for viewer response traffic from the application lambda function origin.
 * The purpose of this function is simply to intercept response output from the application lambda.
 * so that the "application/json" content type can be changed to "text/html" so the browser will format
 * content properly.
  */
export const handler =  async (event:any) => {

  try {
    console.log(JSON.stringify(event, null, 2));

    const appAuth = APP_AUTHORIZATION == 'true';
    const { request } = event.Records[0].cf;
    const { response } = event.Records[0].cf;

    if(response.headers['content-type'] && response.headers['content-type'][0].value === 'application/json') {
      response.headers['content-type'][0].value = 'text/html';
    }

    return response;
  } 
  catch (error:any) {
    return {
      status: 501,
      body: `Viewer response lambda error: ${error.message}`
    }
  }
}