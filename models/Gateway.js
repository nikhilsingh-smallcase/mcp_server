const mongoose = require('mongoose');
// const mongooseAsyncHooks = require('@mongoosejs/async-hooks');
const gatewayConstants = require('../lib/constants');

const { Schema } = mongoose;
const collection = 'gateway';
const gatewaySchema = new Schema(
  {
    // connected to publisher collection if smt is enabled
    name: { type: String, index: true, unique: true, lowercase: true },
    secret: String,
    rotatedSecret: String,
    apiSecret: String,
    rotatedApiSecret: String,
    // frontend SDK sessions should only be initialized in these domains
    authorizedDomains: [String],
    authorizedDomainExpressions: [String],
    postbackUrl: {
      holdings: { type: String, default: '' },
      orders: { type: String, default: '' },
      smtOrders: { type: String, default: '' },
      pendingActions: { type: String, default: '' },
      mfHoldings: { type: String, default: '' },
      lienStatus: { type: String, default: '' },
      events: { type: String, default: '' },
      lienStatusMFCResponse: { type: String, default: '' },
    },
    downtime: {
      value: Boolean,
      reason: String,
      date: Date,
    },
    // put all restrictions of API call according to these flags
    flags: {
      active: { type: Boolean, default: false },
      firstParty: { type: Boolean, default: false },
      sstEnabled: Boolean,
      smtEnabled: Boolean,
      smtDayOrdersEnabled: { type: Boolean, default: false },
      transactionNotifications: { type: Boolean, default: true },
      marketingNotifications: { type: Boolean, default: true },
      holdingsImportEnabled: { type: Boolean, default: false },
      mfHoldingsImportEnabled: { type: Boolean, default: false },
      fullAppExperience: { type: Boolean, default: true },
      smallPlug: { type: Boolean, default: false },
      sessionExtension: { type: Boolean, default: false },
      useAccountOpeningEnabled: { type: Boolean, default: false },
      secretRotation: { type: Boolean, default: false },
      mfHoldingsPledgeEnabled: { type: Boolean, default: false },
      hideGatewayBranding: { type: Boolean, default: false },
      preferredOtpMethod: { type: String, default: 'phone' },
      mfhiWealthEnabled: { type: Boolean, default: false },
      mfhiLendingEnabled: { type: Boolean, default: false },
      mfhiSkipPanInput: { type: Boolean, default: false },
      mfhiV2Enabled: { type: Boolean, default: false },
      imrSetup: { type: Boolean, default: false },
      mfhiSkipOnboardingScreen: { type: Boolean, default: false },
      mfhiInjectJS: { type: Boolean, default: false },
      mfhiInjectJSQrPage: { type: Boolean, default: false },
    },
    featureBlacklist: Object.values(gatewayConstants.features).reduce(
      (map, feature) => {
        map[feature] = [String];
        return map;
      },
      {}
    ),
    meta: {
      displayName: String,
      email: String,
      images: {
        logo: String,
        brand: String,
        other: String,
      },
      leadsReportingEmail: [
        {
          type: String,
          lowercase: true,
        },
      ],
    },
    // eod stats
    stats: {
      lastUpdated: Date,
      activeUsers: Number,
      amountInvested: Number,
      amountTransacted: Number,
    },
    secretRotations: [
      {
        id: mongoose.Types.ObjectId,
        secret: String,
        apiSecret: String,
        timestamp: {
          type: Date,
          default: Date.now(),
        },
      },
    ],
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// gatewaySchema.plugin(mongooseAsyncHooks);

module.exports = mongoose.model('Gateway', gatewaySchema, collection);
