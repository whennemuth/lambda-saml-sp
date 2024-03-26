const { btoa } = require('buffer');

const ResponseMock = function () {
  this._status = 0;
  this._headers = {};
  this.set = (headers) => {
    this._headers = headers; 
    return this;
  }
  this.status = (status) => {
    this._status = status;
    return this;
  }
  this.send = (data) => console.log(`Sending data: ${data}`);
}


const AxiosMock = function () {
  const AxiosResponse = function () {
    this.headers = {};
    this.data = [];
  };  
  this.get = async (url, headers) => {
    this.url = url;
    return new AxiosResponse();
  }
  this.post = async (url, formdata, headers) => {
    this.url = url;
    return new AxiosResponse();
  }
}

describe('entrypoint.js', () => {

  process.env.EXPRESS_PORT = 5000;
  process.env.APP_HOST = 'app';

  const { buildEvent, proxypass } = require('./entrypoint.js');

  it('Should build a lambda event object from http request as expected', () => {
    
    const HeadersMock = function () {
      this.key1 = 'val1';
      this.key2 = 'val2';
      this.key3 = 'val3'; 
      this.host = 'localhost:5000'
    }
    const headers = new HeadersMock();
    const requestMock = {
      url: '/path/to/endpoint?this=that&these=those',
      method: 'GET', 
      headers,
      header: key => headers[key],
      body: {
        key1: 'val1', key2: 'val2', key3: 'val3'
      }
    }

    const event = buildEvent(requestMock);
    expect(event).toEqual({
      Records: [
        {
          cf: {
            config: {
              distributionDomainName: 'localhost:5000'
            },
            request: {
              body: {
                data: btoa('key1=val1&key2=val2&key3=val3')
              },
              method: 'GET',
              querystring: 'this=that&these=those',
              uri: '/path/to/endpoint',
              headers: {
                key1: [ { key: 'key1', value: 'val1' }],
                key2: [ { key: 'key2', value: 'val2' }],
                key3: [ { key: 'key3', value: 'val3' }],
                host: [ { key: 'host', value: 'localhost:5000' }]
              }
            }
          }
        }
      ]
    })
  });

  it('Should proxypass sp url to expected url of app host', async () => {

    const requestMock = {
      url: '/path/to/endpoint?this=that&these=those',
      method: 'GET',
      headers: {},
      body: [ 'request body' ]
    }
    const responseMock = new ResponseMock();
    const axiosMock = new AxiosMock();

    await proxypass(requestMock, responseMock, {}, axiosMock);

    expect(axiosMock.url).toEqual(`https://${process.env.APP_HOST}/path/to/endpoint?this=that&these=those`);
  });

});