/** AWS Lambda entry point for the nightly retention sweep (EventBridge Scheduler). */
import type { Context } from 'aws-lambda';
import { runRetentionSweep } from '../services/retention.service.js';

export const handler = async (_event: unknown, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return runRetentionSweep();
};
