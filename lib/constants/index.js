const { label } = require('./order');
const userApplication = require('./userApplication');

const gatewayOrderTypes = {
  buy: 'buy',
  investmore: 'investmore',
  repair: 'repair',
  exit: 'exit',
  archive: 'archive',
  rebalance: 'rebalance',
  manage: 'manage',
  sip: 'sip',
  securities: 'securities',
  fix: 'fix',
  recon: 'reconciliation',
  dummy: 'dummy',
};

const sipActions = {
  create: 'create',
  manage: 'manage',
  end: 'end',
};

const imrActions = {
  create: 'create',
  manage: 'manage',
  end: 'end',
};

// Keys used in the platform's pending actions object (User.actions.*)
const userActionTypes = {
  FIX: 'fix',
  REBALANCE: 'rebalance',
  INVEST_MORE: 'investMore',
  SIP: 'sip',
};

const sipTypes = {
  AUTO: 'AUTO',
  MANUAL: 'MANUAL',
};

const headers = {
  gatewayAuthToken: 'x-gateway-authtoken',
};

const labelMap = {};
labelMap[gatewayOrderTypes.sip] = label.SIP;
labelMap[gatewayOrderTypes.buy] = label.BUY;
labelMap[gatewayOrderTypes.investmore] = label.INVESTMORE;
labelMap[gatewayOrderTypes.exit] = label.SELLALL;
labelMap[gatewayOrderTypes.manage] = label.MANAGE;
labelMap[gatewayOrderTypes.rebalance] = label.REBALANCE;
labelMap[gatewayOrderTypes.fix] = label.FIX;
labelMap[gatewayOrderTypes.repair] = label.FIX;

const benchmarkIdToNameMap = {
  '.NSEI': 'Equity',
  '.NIFMDCP100': 'Equity Midcap',
  '.NIMI150': 'Equity Midcap',
  '.NIFSMCP100': 'Equity Smallcap',
  '.NIFTY100': 'Equity Large Cap',
  '.NIFTY200': 'Equity Large & Mid Cap',
  '.NILM250': 'Equity Large & Mid Cap',
  '.NIMI400': 'Equity Mid & Small Cap',
  '.NIFTY500': 'Equity Multi Cap',
  '.NGFD': 'Equity, FD & Inflation',
};

const MILLISECONDS_IN_MINUTE = 60 * 1000;
const SECONDS_IN_HOUR = 60 * 60;
const ONE_DAY_IN_SECONDS = 24 * SECONDS_IN_HOUR;

// NOTE: To find the APIs Easily they are set in alphabetical order.
// When adding a new API, please tend to maintain the order
const scInternalApis = {
  addSmallcaseToWatchlist: '/v2/internal/user/sc/watchlist/add',
  cancelBatch: '/v2/internal/user/sc/cancelBatch',
  cancelRebalance: '/v2/internal/user/sc/actions/rebalance/cancel',
  cancelSubscriptionFeedback:
    '/v1/internal/gateway/subscriptions/cancelFeedback',
  checkFunds: '/v2/internal/user/sc/funds',
  checkStatus: '/v2/internal/market/checkStatus',
  consentPublisher: '/v3/internal/consent/publisher',
  completeReconFlow: '/v2/internal/user/completeReconFlow',
  createUserEvent: '/v2/internal/user/sc/events/create',
  deleteDraft: '/v2/internal/user/sc/drafts/delete',
  downloadInvoice: '/v1/internal/gateway/subscriptions/download',
  exportRebalanceTimelineChart: '/v2/internal/smallcases/rebalance/export',
  exportRebalanceTimelineChartV2: '/sam/internal/smallcases/rebalances/export',
  fees: '/v2/internal/user/sc/fees',
  fetchEmandateAmount: '/v2/internal/user/sc/emandate/amount',
  fetchUserFunds: '/v2/internal/user/fetchFunds',
  getDraft: '/v2/internal/user/sc/drafts/draft',
  getDrafts: '/v2/internal/user/sc/drafts',
  getDashboard: '/v2/internal/smallcases/dashboard',
  getExitedInvestments: '/v2/internal/user/sc/investments/exited',
  getExitedSmallcasesV2: '/sam/internal/investment/listing/exitedSmallcase',
  getHistoricalFileURL: '/v2/internal/smallcases/historical/export',
  getHistoricalCostAdjusted: '/smallcases/historical/costAdjusted/v2',
  getBrokerConfig: '/smallcases/getBrokerConfig',
  getImageUploadConfig: '/v2/internal/user/sc/drafts/getImageUploadConfig',
  getImr: '/v2/internal/user/sc/actions/imr/get',
  getImrDetails: '/v2/internal/user/imrDetails',
  getInvestmentInsights: '/v2/internal/user/sc/investmentInsights',
  getInvestments: '/v2/internal/user/sc/investments',
  getInvestmentsV2: '/sam/internal/investment',
  getNews: '/v2/internal/user/sc/getNews',
  getOrders: '/v2/internal/user/sc/orders',
  getOrdersV2: '/sam/internal/orders',
  getGroupedSmallcaseOrdersV2: '/sam/internal/orders/group/smallcase',
  getPendingActionsV2: '/sam/internal/pendingActions/v2',
  getTotalReturnsV2: '/sam/internal/investment/total/v3',
  getScidList: '/v2/internal/smallcases/getScidList',
  getScOrdersWithBatchIds: '/v2/internal/sc/orders',
  getSmallcaseProfile: '/v3/internal/smallcase',
  getBillingHistory:
    '/v1/internal/gateway/subscriptions/:version/billingHistory',
  getMFSipDetails: '/sam/internal/investment/mf/sip',
  getSip: '/v2/internal/user/sc/actions/sip/get',
  getSipDetails: '/v2/internal/user/sipDetails',
  getSmallcasesV2: '/sam/internal/smallcases/v2',
  getSmallcaseInvestments: '/sam/internal/investment/smallcase/:iscid',
  getSmallcaseListing: '/sam/internal/investment/listing/smallcase',
  getSmallcaseReturns: '/v2/internal/user/sc/investments/smallcase',
  getGraphPerformance: '/sam/internal/graph/performance',
  getSubscriptionConnections: '/sam/internal/subscriptions/connections',
  getSubscriptionsV2: '/sam/internal/subscriptions/v2',
  getTotalInvestments: '/v2/internal/user/sc/investments/total',
  getUser: '/v3/internal/user/sc/getUser',
  getUserHoldings: '/v2/internal/user/holdings',
  getUserMeta: '/v2/internal/user/broker/meta',
  getWatchlistSmallcases: '/v2/internal/user/sc/watchlist',
  ignoreImr: '/v2/internal/user/sc/actions/imr/ignore',
  ignoreSIP: '/v2/internal/user/sc/actions/sip/ignore',
  ignoreSubscription: '/v2/internal/user/sc/actions/subscription/ignore',
  archiveMFPendingAction: '/sam/internal/pendingActions/archive/mf',
  ignoreSubscriptionV2: '/sam/internal/pendingActions/subscription/ignore',
  markAllNotificationsRead: '/v2/internal/user/sc/notifications/read/all',
  markNotificationRead: '/v2/internal/user/sc/notifications/read',
  notifications: '/v2/internal/user/sc/notifications',
  offlineDataSync: '/v2/internal/user/sc/sync',
  removeSmallcaseFromWatchlist: '/v2/internal/user/sc/watchlist/remove',
  saveDraft: '/v2/internal/user/sc/drafts/save',
  saveSharedSmallcase: '/v2/internal/user/sc/saveSharedSmallcase',
  sendPhoneVerificationOtp: '/v2/internal/user/sc/otp/send',
  setFlag: '/v2/internal/user/sc/setFlag',
  setFullAppExperience: '/v2/internal/user/sc/setFullAppExperience',
  shareSmallcaseApis: '/v2/internal/user/sc/shareSmallcase',
  stockPriceAndChange: '/v2/internal/market/priceAndChange',
  toggleSubscriptionFlags: '/v1/internal/gateway/subscriptions/toggle',
  subscriptionCancelInfo: '/v1/internal/gateway/subscriptions/cancelInfo',
  updateDraftInfo: '/v2/internal/user/sc/drafts/updateInfo',
  updateProfile: '/v2/internal/user/sc/updateProfile',
  updateWeightStrategy: '/v2/internal/user/sc/updateWeightStrategy',
  updateWeightStrategyV2: '/sam/internal/user/weightStrategy',
  validateCancelAmo: '/v2/internal/user/sc/validateCancelAmo',
  validateSamConnect: '/v2/internal/gateway/sam/auth',
  validateSMTOrder: '/v2/internal/user/sc/validateSMTOrder',
  validateSubscriptionOrderConfig:
    '/v2/internal/user/sc/validateSubscriptionOrderConfig',
  validateUserInvestment: '/v2/internal/user/sc/validateUserInvestment',
  verifyOtp: '/v2/internal/user/sc/otp/verify',
  validateSamLink: '/v2/internal/gateway/sam/link',
};

const mfInvestmentsApis = {
  mandateStatus: '/user/:userId/mandates/:mandateId',
  orderStatus: '/user/:userId/orders/:orderId',
  validateSmtOrder: '/smallcase/order/validate',
  validateIntentOrder: '/gateway/intent/validate',
  validateSingleMFIntentOrder: 'gateway/intent/singlemf/validate',
};

const smeInternalAPIs = {
  smallcaseHistoricalData: 'smallcases/historicalData',
  smallcaseHistoricalDataSync: '/smallcases/historicalDataStatus',
  smallcaseManagerProfile: '/publisher/profile',
  smallcaseRebalances: '/smallcases/rebalances',
};

const useaoInternalAPIs = {
  getLeadStatus: '/internal/status',
};

const requestMethods = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  DELETE: 'delete',
};

const gatewayPartners = {
  smallcaseWebsite: 'smallcase-website',
};

const intents = {
  CONNECT: 'CONNECT',
  ONBOARDING: 'ONBOARDING',
  TRANSACTION: 'TRANSACTION',
  MANDATE: 'MANDATE',
  HOLDINGS_IMPORT: 'HOLDINGS_IMPORT',
  AUTHORISE_HOLDINGS: 'AUTHORISE_HOLDINGS',
  FETCH_FUNDS: 'FETCH_FUNDS',
  IMR_SETUP: 'IMR_SETUP',
  SIP_SETUP: 'SIP_SETUP',
  SUBSCRIPTION: 'SUBSCRIPTION',
  CANCEL_ORDER: 'CANCEL_ORDER',
  CANCEL_AMO: 'CANCEL_AMO',
  MF_HOLDINGS_IMPORT: 'MF_HOLDINGS_IMPORT',
  PLEDGE: 'PLEDGE',
  UNPLEDGE: 'UNPLEDGE',
};

const connectionStatus = {
  ADMIN: 'ADMIN',
  CONNECTED: 'CONNECTED',
  SAM_CONNECTED: 'SAM_CONNECTED',
  GUEST: 'GUEST',
  UNCONNECTED: 'UNCONNECTED',
};

const transactionOrderType = {
  SECURITIES: 'SECURITIES',
  RECONCILIATION: 'RECONCILIATION',
  DUMMY: 'DUMMY',
  BUY: 'BUY',
  REBALANCE: 'REBALANCE',
};

const features = {
  SST: 'sst',
  RECONCILIATION: 'reconciliation',
  DUMMY: 'dummy',
  SMT: 'smt',
  LEADGEN: 'leadgen',
  HOLDINGS_IMPORT: 'holdingsImport',
  CONNECT: 'connect',
  AUTHORISE_HOLDINGS: 'authoriseHoldings',
  FETCH_FUNDS: 'fetchFunds',
  IMR_SETUP: 'imrSetup',
  SIP_SETUP: 'sipSetup',
  DAY_ORDERS: 'dayOrders',
  SHOW_ORDERS: 'showOrders',
  SUBSCRIPTION: 'subscription',
  MUTUALFUND: 'mutualFund',
  NATIVE_ANDROID_LOGIN: 'nativeAndroidLogin',
  NATIVE_IOS_LOGIN: 'nativeIOSLogin',
  REBALANCE_AUTO_RETRY: 'rebalanceAutoRetry',
};

const agentTypes = {
  android: 'android',
  ios: 'ios',
  mweb: 'mweb',
  web: 'web',
};

const smallPlugIntents = {
  CONNECT: 'CONNECT',
  AUTHORISE_HOLDINGS: 'AUTHORISE_HOLDINGS',
  FETCH_FUNDS: 'FETCH_FUNDS',
  IMR_SETUP: 'IMR_SETUP',
  SIP_SETUP: 'SIP_SETUP',
  SMT: 'SMT',
  RECONCILIATION: 'RECONCILIATION',
};

const expiryTime = {
  TRANSACTION: {
    DEFAULT: 15 * MILLISECONDS_IN_MINUTE, // 15 minutes
    RECONCILIATION: 30 * MILLISECONDS_IN_MINUTE, // 30 minutes
    DUMMY: 30 * MILLISECONDS_IN_MINUTE, // 30 minutes
    SUBSCRIPTION: 45 * MILLISECONDS_IN_MINUTE, // 45 minutes
    ONBOARDING: 30 * MILLISECONDS_IN_MINUTE, // 30 minutes
  },
};

const distributorMetaAllowedStatus = {
  PUBLISHED: 'PUBLISHED',
  UNLISTED: 'UNLISTED',
};

const webviewLdFlagVariations = {
  CUSTOM_TAB: 'CUSTOM_TAB',
  WEBVIEW: 'WEBVIEW',
};

const skipMarketStatusCheckOrderTypes = [
  transactionOrderType.DUMMY,
  transactionOrderType.RECONCILIATION,
  transactionOrderType.REBALANCE,
];

module.exports = {
  gatewayOrderTypes,
  headers,
  labelMap,
  ONE_DAY_IN_SECONDS,
  SECONDS_IN_HOUR,
  scInternalApis,
  smeInternalAPIs,
  requestMethods,
  benchmarkIdToNameMap,
  gatewayPartners,
  intents,
  connectionStatus,
  transactionOrderType,
  features,
  agentTypes,
  sipActions,
  imrActions,
  userActionTypes,
  sipTypes,
  smallPlugIntents,
  userApplication,
  useaoInternalAPIs,
  expiryTime,
  distributorMetaAllowedStatus,
  mfInvestmentsApis,
  webviewLdFlagVariations,
  skipMarketStatusCheckOrderTypes,
};
