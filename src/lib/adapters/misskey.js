import { CONFIDENCE, fromInconclusive, STATUS } from '../status.js';

export const checkMisskey = async ({ client, host, username }) => {
  const response = await client.request(`https://${host}/api/users/show`, { method: 'POST', payload: { username } });

  if (response.status === 404) {
    return {
      confidence: CONFIDENCE.MEDIUM,
      notes: ['Misskey answers the same for accounts that never existed and accounts that were suspended.'],
      status: STATUS.UNAVAILABLE
    };
  }
  if (response.status !== 200 || !response.json) return fromInconclusive(response);

  const { isSilenced, isSuspended, movedTo } = response.json;
  // Current Misskey and Sharkey answer 404 instead, but a fork that reports this mustn’t come out as active
  if (isSuspended) return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.SUSPENDED };
  if (isSilenced) return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.LIMITED };
  if (movedTo) return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.MOVED };
  return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.ACTIVE };
};