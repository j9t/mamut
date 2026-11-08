import { CONFIDENCE, fromInconclusive, labelSoftware, STATUS } from '../status.js';

/** Uses WebFinger only, as software without a public ban signal can’t support more */
export const checkGeneric = async ({ software, webfinger }) => {
  const nameSoftware = labelSoftware(software);
  if (webfinger.found === true) {
    return {
      confidence: CONFIDENCE.LOW,
      notes: [`The handle resolves, but ${nameSoftware} doesn’t publish whether an account is suspended or limited.`],
      status: STATUS.UNDETERMINED
    };
  }
  if (webfinger.found === false) {
    return {
      confidence: CONFIDENCE.LOW,
      notes: ['The handle doesn’t resolve. The account may never have existed, or it may have been suspended or deleted.'],
      status: STATUS.UNAVAILABLE
    };
  }
  return fromInconclusive(webfinger.response);
};