/**
 * AWS Lambda entry point for the HTTP API (Lambda Function URL or API Gateway v2 payloads).
 * CloudFront routes /api/* here; uploads and downloads go directly to S3 via presigned links,
 * so request bodies stay small.
 */
import awsLambdaFastify, { type LambdaResponse, type PromiseHandler } from '@fastify/aws-lambda';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { ensurePresetRubrics } from '../services/rubrics.service.js';

let proxy: PromiseHandler<APIGatewayProxyEventV2, LambdaResponse> | null = null;

async function getProxy() {
  if (proxy) return proxy;
  await prisma.$connect();
  await ensurePresetRubrics(null);
  const app = await buildApp();
  await app.ready();
  proxy = awsLambdaFastify<APIGatewayProxyEventV2>(app, { decorateRequest: false });
  return proxy;
}

export const handler = async (event: APIGatewayProxyEventV2, context: Context) => {
  // Let the Lambda runtime reuse the database connection across invocations.
  context.callbackWaitsForEmptyEventLoop = false;
  const p = await getProxy();
  return p(event, context);
};
