import { GetSecretValueCommand, GetSecretValueCommandOutput, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import * as context from '../../../context/context.json';

const { _secretArn, _refreshInterval, samlCertSecretFld, samlPrivateKeySecretFld, jwtPublicKeySecretFld, jwtPrivateKeySecretFld } = context.SHIBBOLETH.secret;
const refreshInterval = parseInt(_refreshInterval)

export type CachedKeys = {
  _timestamp: number;
  samlCert: string;
  samlPrivateKey: string;
  jwtPrivateKey: string;
  jwtPublicKey: string;
}

export type SecretsConfig = {
  _secretArn:string;
  _refreshInterval:string;
  samlCertSecretFld:string;
  samlPrivateKeySecretFld:string;
  jwtPublicKeySecretFld:string;
  jwtPrivateKeySecretFld:string
}

/**
 * The cache is refreshable if any of the keys in it are empty, or the timestamp indicates it's time to refresh.
 * @param cache 
 * @returns 
 */
const refreshable = (cache:CachedKeys, refreshInterval:number, now:number) => {
  const { _timestamp, jwtPrivateKey, jwtPublicKey, samlCert, samlPrivateKey } = cache;
  const foundEmpty = 
    samlCert.length === 0 ||
    samlPrivateKey.length === 0 ||
    jwtPublicKey.length === 0
    jwtPrivateKey.length === 0;
  if (foundEmpty || now - _timestamp > refreshInterval) {
    return true;
  }
  return false;
}

/**
* Obtain the shibboleth & jwt certs/keys from secrets manager and populate the supplied cache object with them.
* @returns 
*/
export async function checkCache(cache:CachedKeys, config?:SecretsConfig): Promise<void> {
  // If a cache configuration is not supplied, get it from the context instead.
  const _config = config || {
    refreshInterval, _secretArn, jwtPrivateKeySecretFld, jwtPublicKeySecretFld, samlCertSecretFld, samlPrivateKeySecretFld
  };
  
  const now = Date.now();
  if (refreshable(cache, refreshInterval, now)) {
    try {
      const { _secretArn, samlCertSecretFld, samlPrivateKeySecretFld, jwtPrivateKeySecretFld, jwtPublicKeySecretFld } = _config;
      const command = new GetSecretValueCommand({ SecretId: _secretArn });
      const region = _secretArn.split(':')[3];
      const secretsClient = new SecretsManagerClient({ region });
      const response:GetSecretValueCommandOutput = await secretsClient.send(command);
      if( ! response.SecretString) {
        throw new Error('Empty/missing cert!');
      }
      const fieldset = JSON.parse(response.SecretString);
      cache.samlCert = fieldset[samlCertSecretFld];
      cache.samlPrivateKey = fieldset[samlPrivateKeySecretFld];
      cache.jwtPublicKey = fieldset[jwtPublicKeySecretFld];
      cache.jwtPrivateKey = fieldset[jwtPrivateKeySecretFld];
      cache._timestamp = now;
      console.log(`Retrieved shib cert from secrets manager in ${Date.now() - now} milliseconds`);
    } catch (e) {
      console.error(`Cannot get cert from secrets manager, error: ${e}`);
    }
  }
  else {
    console.log('Using cache: certs & keys found in cache and before their stale date');
  }
}