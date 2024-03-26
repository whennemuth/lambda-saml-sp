import { CfnOutput, Duration, Fn, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IContext } from '../context/IContext';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { FunctionUrl, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { AllowedMethods, CachePolicy, Distribution, LambdaEdgeEventType, OriginBindConfig, OriginBindOptions, OriginProtocolPolicy, OriginRequestPolicy, PriceClass, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Bucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';

export class LambdaShibbolethStackResources extends Construct {
  constructor(stack: Construct, stackName: string, props?: any) {
    super(stack, stackName);

    const context:IContext = stack.node.getContext('stack-parms');

    // Lambda@Edge origin request function
    const edgeFunctionOrigin = new NodejsFunction(stack, 'EdgeFunctionOrigin', {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/FunctionSpOrigin.ts',
      functionName: context.EDGE_REQUEST_ORIGIN_FUNCTION_NAME,
      bundling: {
        externalModules: [ '@aws-sdk/*' ],
      },
      role: new Role(stack, 'EdgeLambdaRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        inlinePolicies: {
          "ReadSecretsManager": new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'secretsmanager:GetSecretValue', 'secretsmanager:ListSecrets' ],
                effect: Effect.ALLOW,
                resources: [ '*' ],    
              }),
              new PolicyStatement({
                actions: [ 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents' ],
                effect: Effect.ALLOW,
                resources: [ '*' ],    
              }),
            ]
          })
        },
      }),
    });

    // Lambda@Edge viewer response function
    const edgeFunctionViewer = new NodejsFunction(stack, 'EdgeFunctionViewer',{
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/FunctionSpViewer.ts',
      functionName: context.EDGE_RESPONSE_VIEWER_FUNCTION_NAME,
    });

    // Simple lambda-based web app
    const appFunction = new NodejsFunction(stack, 'AppFunction', {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/FunctionApp.ts',
      timeout: Duration.seconds(10),
      functionName: context.APP_FUNCTION_NAME,     
      environment: {
        APP_AUTHORIZATION: context.APP_AUTHORIZATION
      }
    });

    // Lambda function url for the web app.
    const appFuncUrl = new FunctionUrl(appFunction, 'Url', {
      function: appFunction,
      // authType: FunctionUrlAuthType.AWS_IAM,
      authType: FunctionUrlAuthType.NONE,      
    })

    // CloudFront Distribution
    const cloudFrontDistribution = new Distribution(stack, 'MyCloudFrontDistribution', {
      priceClass: PriceClass.PRICE_CLASS_100,
      logBucket: new Bucket(stack, 'MyCloudFrontDistributionLogsBucket', {
        removalPolicy: RemovalPolicy.DESTROY,    
        autoDeleteObjects: true,
        objectOwnership: ObjectOwnership.OBJECT_WRITER
      }),
      defaultBehavior: {
        /**
         * This split function should take a function url like this:
         *    https://dg4qdeehraanv7q33ljsrfztae0fwyvz.lambda-url.us-east-2.on.aws/
         * and extract its domain like this:
         *    dg4qdeehraanv7q33ljsrfztae0fwyvz.lambda-url.us-east-2.on.aws
         * 'https://' is removed (Note: trailing '/' is also removed)
         */
        origin: new HttpOrigin(Fn.select(2, Fn.split('/', appFuncUrl.url)), {
          protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
          httpsPort: 443,
          originPath: '/',
          customHeaders: {
            APP_AUTHORIZATION: `${'false' == context?.APP_AUTHORIZATION ? 'false' : 'true' }`
          }       
        }),
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        /**
         * NOTE: VIEWER_REQUEST event type would have been preferable so that this lambda is hit despite what's in
         * the cache. However, that means a 1 MB code limit, which seems to be exceeded, making ORIGIN_REQUEST the
         * only choice with a 50 MB code limit. In order the lambda get hit for EVERY request, caching is disabled.
         */
        cachePolicy: CachePolicy.CACHING_DISABLED,
        /** 
         * NOTE: This origin request policy is necessary to get querystring in edge lambda events, and exclude the
         * host header from the origing (the app lambda), which, coming from cloudfront would resemble something 
         * similar to d12345678.cloudfront.net and would not be recognized by the Lambda, resulting in 403.
         * SEE: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html#managed-origin-request-policies-list
         */
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        edgeLambdas: [
          {
            // eventType: LambdaEdgeEventType.VIEWER_REQUEST,
            eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
            functionVersion: edgeFunctionOrigin.currentVersion,
            includeBody: true
          },
          {
            eventType: LambdaEdgeEventType.VIEWER_RESPONSE,
            functionVersion: edgeFunctionViewer.currentVersion,
          }
        ]
      },
    });

    appFuncUrl.grantInvokeUrl(edgeFunctionOrigin);
  
    // Outputs
    new CfnOutput(stack, 'CloudFrontDistributionURL', {
      value: `https://${cloudFrontDistribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

  }
}
