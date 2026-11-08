import { CONFIDENCE, fromInconclusive, STATUS } from '../status.js';
import { parseVersion } from '../version.js';
import { checkGeneric } from './generic.js';

const CODE_MISSING = 'couldnt_find_person';

export const checkLemmy = async (context) => {
  const { client, host, software, username } = context;
  // The v3 API is confirmed for 0.x only
  if (parseVersion(software.version)?.major !== 0) return checkGeneric(context);

  const name = encodeURIComponent(username);
  const response = await client.request(`https://${host}/api/v3/user?username=${name}&limit=1`);

  if (response.json?.error === CODE_MISSING) {
    const actor = await client.request(`https://${host}/u/${name}`, { accept: 'application/activity+json', read: false });
    return actor.status === 410
      ? { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.DELETED }
      : { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.NOT_FOUND };
  }

  const person = response.json?.person_view?.person;
  if (response.status !== 200 || !person) return fromInconclusive(response);

  if (person.banned) {
    const banExpires = person.ban_expires ?? null;
    const notes = banExpires ? ['This is a temporary ban.'] : [];
    return { banExpires, confidence: CONFIDENCE.HIGH, notes, status: STATUS.SUSPENDED };
  }
  if (person.deleted) return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.DELETED };
  return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.ACTIVE };
};