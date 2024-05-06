## Configuration Context

CDK stack deployment imports a [Runtime Context](https://docs.aws.amazon.com/cdk/v2/guide/context.html) for configuration details.
This context is configured in a context.json file and the content of this file is cast to a type found in IContext.ts.
In order to create IContext.ts or modify it to reflect changes to `./context/context.json` run the following:

```
cd context/
quicktype context.json -o IContext.ts
```

#### Overview:

This stack can be configured against two modes:

1. **Standard**: This mode sets up a [cloudfront distribution](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-overview.html) and a [cloudfront lambda@edge origin request function](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html).
   You indicate this mode by including a "APP_ALB_DNS" value in `./context/context.json`.
   It is assumed that your origin application is serviced by a [application load balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html) and providing its dns name is enough to "point" the cloudfront distribution at it as an origin.
2. **Demo:** This mode sets up the cloudfront distribution, lambda@edge origin request function, a "dummy" [lambda function](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html), and a [function url](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html).
   You indicate this mode by omitting "APP_ALB_DNS_NAME" and including "APP_FUNCTION_NAME" and "EDGE_RESPONSE_VIEWER_FUNCTION_NAME".
   The intent of this mode is to deploy to aws all of the Shibboleth SP functionality in cloudfront AND an origin "application" for it to target. The simplest and most lightweight option for this is another lambda function. This follows AWS directions on ["Using a Lambda function URL"](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html#concept_lambda_function_url)

#### Context fields:

- EDGE_REQUEST_ORIGIN_FUNCTION_NAME: The name you choose for the [cloudfront lambda@edge origin request function](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html).
- EDGE_RESPONSE_VIEWER_FUNCTION_NAME: *("demo" setup only)* The name you choose for the [cloudfront lambda@edge viewer request function](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-the-edge.html).
- APP_FUNCTION_NAME: *("demo" setup only)* The name you choose for the "dummy" app that serves as the origin in a "demo" setup.
  *SEE: ["Using a Lambda function URL"](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html#concept_lambda_function_url)*
- APP_ALB_DNS: Configurations that pertain to the [application load balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html) you want to target as the origin for cloudfront.
  - name: The dns name of the ALB targeted as the origin.
  - httpPort: The port the ALB will be listening on for incoming http requests.
  - httpsPort: The port the ALB will be listening on for incoming https requests.
- *SEE: ["Using an application load balancer"](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html#concept_elb_origin) and ["Restricting access to Application Load Balancers"](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html)*
- APP_AUTHORIZATION: This serves as a boolean that indicates a mode of operation for the origin request function:
  - "true": *default*, requests are passed through to the origin which decides if that request needs to be kicked back to shibboleth for authentication
  - "false": The origin request function requires ALL incoming requests to show evidence of having authenticated with shibboleth before passing through to the origin.
- APP_LOGIN_HEADER: The name of the http header that the origin application will reference for a value that indicates the redirect path for authentication. If a request to an app endpoint that needs to be private is missing an authentication token ([JWT](https://jwt.io/introduction)) the app will redirect to the path indicated by this header value.
- APP_LOGOUT_HEADER: The name of the http header that the origin application will reference for a value that indicates the redirect path for logging off with shibboleth. This will accomplish wiping out any headers that were created by shibboleth and landing on a signout page. *(NOTE): The origin request lambda function will also invalidate the JWT created the user first authenticated.*
- SHIBBOLETH:
  - entityId: The ID of your application service provider
  - idpCert: The public key as published by shibboleth at the IDP entity ID endpoint.
    For example, this would be the `<EntityDescriptor>.<IDPSSODescriptor>.<KeyDescriptor>.<ds:KeyInfo>.<ds:X509Data>.<ds:X509Certificate>` value at [https://shib-test.bu.edu/idp/shibboleth](https://shib-test.bu.edu/idp/shibboleth) for the shibboleth test IDP
  - entrypoint: The redirect binding published by shibboleth at the IDP entity ID endpoint.
    For example, this would be the  `<EntityDescriptor>.<IDPSSODescriptor>.<KeyDescriptor><SingleSignOnService>` value at [https://shib-test.bu.edu/idp/shibboleth](https://shib-test.bu.edu/idp/shibboleth) for the shibboleth test IDP
  - logoutUrl: The "SLO" value as documented by the techweb [Configuration Information for Application Admins](https://www.bu.edu/tech/services/security/iam/authentication/shibboleth/configuration/) page. This is the url redirected to by  your app for logging out with shibboleth
  - secret:
    All the private keys and certs are stored in secrets manager
    - _secretArn: The AWS [ARN](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html) of the [secrets manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) secret where the private keys and certs are stored.
    - _refreshInterval: The lambda@edge origin request function caches the secret to avoid having to perform a secrets manager lookup for each request. This cache is refreshed at an interval specified by this value in milliseconds.
    - samlCertSecretFld: The [Service Provider Checklist](https://www.bu.edu/tech/services/security/iam/authentication/shibboleth/service-provider-checklist/) techweb form requires you to provide a "Service Provider Metadata" xml file to register your app as a service provider with shibboleth. Shibboleth requires a public portion of a certificate keypair to be provided in this file at `<md:EntityDescriptor>.<md:SPSSODescriptor>.<md:KeyDescriptor>.<ds:KeyInfo>.<ds:X509Data>.<ds:X509Certificate>`. This field is that public certificate value.
    - samlPrivateKeySecretFld: This is the private key that matches the samlCertSecretFld certificate.
    - jwtPublicKeySecretFld: This is the public portion of a RSA keypair. It is used in signing the [JSON web token (JWT)](https://jwt.io/introduction) by the Lambda@edge origin request function. [Example for generating this key](https://www.npmjs.com/package/node-forge#rsa)
    - jwtPrivateKeySecretFld: This is the private counterpart of jwtPublicKeySecretFld

#### Example:

```
{
  "STACK_ID": "shibsp",
  "ACCOUNT": "037860335094",
  "REGION": "us-east-1",
  "LANDSCAPE": "shibtest",
  "EDGE_REQUEST_ORIGIN_FUNCTION_NAME": "SPFunctionOrigin",
  "EDGE_RESPONSE_VIEWER_FUNCTION_NAME": "SPFunctionViewer",
  "APP_FUNCTION_NAME": "AppFunction",
  "APP_ALB_DNS": {
    "name": "wp-jaydubbulb-alb-devl-1167093510.us-east-2.elb.amazonaws.com",
    "httpPort": 8081,
    "httpsPort": 443
  },
  "APP_AUTHORIZATION": "true",
  "APP_LOGIN_HEADER": "SHIB-HANDLER",
  "APP_LOGOUT_HEADER": "SHIB_IDP_LOGOUT",
  "SHIBBOLETH": {
    "entityId": "https://*.kualitest.research.bu.edu/shibboleth",
    "idpCert": "MIIDPDCCAiSgAwIBAgIVAJ6eiJuZK4QyWfKYUqfJdhx4wzkPMA0GCSqGSIb3DQEBBQUAMB8xHTAbBgNVBAMTFHdlYmxvZ2luLXRlc3QuYnUuZWR1MB4XDTEwMDkxNTE0Mjg0OFoXDTMwMDkxNTE0Mjg0OFowHzEdMBsGA1UEAxMUd2VibG9naW4tdGVzdC5idS5lZHUwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCI5moQtXWSwpI/nt/fppWlIh4KDpF7AoetWTiSekjj6rQNIAVV1BiTGjvcPSsQzdEJZKpgO6tjMxPi8UiP8yXgcklzgsrHHGuIlQt6dwZNgS9IxkDnNTn8YqHoFoIm1v/po34qFERVzAo2n8SphHz3Pfp5BBH/Xc2q/IHxtBbSlhszx+2qYCzUuIVgONR+dN63ZmoRYoEakjosuTHxSqHxTXrPpE01FLCEfMXJlploh6ZrV96Y5pScMnn8ULr0Sgsq8x4qCDP2llEXRAsn/WWpzzmTFxGezzXgA2OQLeDMbq6SqmZ7E7dNEu244E9l1JnHLQBsPe9PXP/QEV7h+f/5AgMBAAGjbzBtMEwGA1UdEQRFMEOCFHdlYmxvZ2luLXRlc3QuYnUuZWR1hitodHRwczovL3dlYmxvZ2luLXRlc3QuYnUuZWR1L2lkcC9zaGliYm9sZXRoMB0GA1UdDgQWBBTPzLtx4wmThF7g6C3eCj6zw4tfszANBgkqhkiG9w0BAQUFAAOCAQEAC3lmttoHGXIHfEL75ViI8EyQD44J+bKIYTvbvQmBLS7Lw4iNgalmHnOgs5RBB5oIzOVWgeRUv0bwl48Gp4F9k7cXXDTwZRUxYc6kV9d/dEOCyOEDl4cDhsbM/TJJHPOVLhhPJXec07b3qxb4SaU/YP0ZiE+zD4FqikvZYkD20blmDIJbKPZvBlqfYZ0bBEdnKbWRH8uvFxgm1cz3+azzIWjqGXc7259shmJc391vNwva8SzJG9mUghTKGW1tdu3uoF6tIf/a3sUPxL+z0F0newS75gUl4ccWCjO4TuDgfyJEcjIZ0CYyIvzmtiWg7ZJxvG0zzYcx1ps3hT3nP38erw==",
    "entryPoint": "https://shib-test.bu.edu/idp/profile/SAML2/Redirect/SSO",
    "logoutUrl": "https://shib-test.bu.edu/idp/logout.jsp",
    "secret": {
      "_secretArn": "arn:aws:secretsmanager:us-east-2:037860335094:secret:dev/wp/shib-sp-test-JML3FN",
      "_refreshInterval": "3600000",
      "samlPrivateKeySecretFld": "wp-sp-key",
      "samlCertSecretFld": "wp-sp-cert",
      "jwtPrivateKeySecretFld": "wp-jwt-prikey",
      "jwtPublicKeySecretFld": "wp-jwt-pubkey"
    }
  },
  "TAGS": {
    "Service": "client",
    "Function": "ett",
    "Landscape": "dev"
  }
}
```

