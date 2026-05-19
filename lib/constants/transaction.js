const transactionStatus = {
  INITIALIZED: 'INITIALIZED', // when started from be-be flow
  USED: 'USED', // when connect flow is validated, not valid for intent = CONNECT itself
  PROCESSING: 'PROCESSING', // intent flow is in process, only valid for backgroud processes
  COMPLETED: 'COMPLETED', // switched by various services according to intent
  ACTION_REQUIRED: 'ACTION_REQUIRED', // when action is pending on behalf of the user
  ERRORED: 'ERRORED', // client side error
  CANCELLED: 'CANCELLED', // explicit user cancellation
  EXPIRED: 'EXPIRED', // by EOD job
};

const subscriptionStatus = {
  NONE: 'NONE',
  SUBSCRIBED: 'SUBSCRIBED',
  PENDING: 'PENDING',
  ALREADY_SUBSCRIBED: 'ALREADY_SUBSCRIBED',
};

const assetUniverse = {
  MUTUAL_FUND: 'MUTUAL_FUND',
};

/**
 * MFHI (MF Holdings Import) Constants
 * Used for v2 MFC CAS integration flow
 */
const mfhiFlow = {
  WEALTH: 'wealth',
  LENDING: 'lending',
};

const mfhiVersion = {
  V1: 'v1',
  V2: 'v2',
};

module.exports = {
  assetUniverse,
  transactionStatus,
  subscriptionStatus,
  mfhiFlow,
  mfhiVersion,
};
