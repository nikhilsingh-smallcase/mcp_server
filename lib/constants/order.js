module.exports = {
  orderType: {
    MARKET: 'MARKET',
    LIMIT: 'LIMIT',
    SL: 'SL',
    SLM: 'SLM',
  },
  validity: {
    IOC: 'IOC',
    DAY: 'DAY',
  },
  label: {
    BUY: 'BUY',
    INVESTMORE: 'INVESTMORE',
    SIP: 'SIP',
    AUTOSIP: 'AUTOSIP',
    PARTIALEXIT: 'PARTIALEXIT',
    SELLALL: 'SELLALL',
    MANAGE: 'MANAGE',
    REBALANCE: 'REBALANCE',
    FIX: 'FIX',
  },
  source: {
    PROFESSIONAL: 'PROFESSIONAL',
    CUSTOM: 'CUSTOM',
    CREATED: 'CREATED',
    ADHOC: 'ADHOC',
  },
  txnStatus: {
    PLACED: 'PLACED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
    COMPLETE: 'COMPLETE',
    ERROR: 'ERROR',
    CANCELLED_AMO: 'CANCELLED AMO',
    PARTIAL: 'PARTIAL',
  },
  product: {
    CNC: 'CNC', // Cash n Carry
    NRML: 'NRML', // Collatoral
  },
  exchange: {
    NSE: 'NSE',
    BSE: 'BSE',
  },
  agent: {
    WEB: 'web',
    MWEB: 'mweb',
    IOS: 'ios',
    ANDROID: 'android',
    BR_IOS: 'br_ios',
    BR_ANDROID: 'br_android',
    BR_DESKTOP_APP: 'br_desktop_app',
    BR_DEALER_1: 'br_dealer_1',
    BR_DEALER_2: 'br_dealer_2',
  },
  status: {
    PLACED: 'PLACED',
    ERROR: 'ERROR',
    UNPLACED: 'UNPLACED',
    PARTIALLYPLACED: 'PARTIALLYPLACED',
    UNFILLED: 'UNFILLED',
    PARTIALLYFILLED: 'PARTIALLYFILLED',
    COMPLETED: 'COMPLETED',
    FIXED: 'FIXED',
    MARKEDCOMPLETE: 'MARKEDCOMPLETE',
    CANCELLED: 'CANCELLED',
  },
  variety: {
    AMO: 'amo',
    REGULAR: 'regular',
  },
  isc: {
    status: {
      VALID: 'VALID',
      INVALID: 'INVALID',
      PLACED: 'PLACED',
    },
    source: {
      PROFESSIONAL: 'PROFESSIONAL',
      CUSTOM: 'CUSTOM',
      CREATED: 'CREATED',
      ADHOC: 'ADHOC',
    },
    tier: {
      BASIC: 'BASIC',
      PREMIUM: 'PREMIUM',
    },
  },
};
